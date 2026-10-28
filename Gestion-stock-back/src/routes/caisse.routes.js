const express = require('express');
const pool = require('../config/db');
const { authentifier } = require('../middleware/auth');
const { bornes } = require('../utils/periode');

const router = express.Router();
router.use(authentifier);

const arrondi = (n) => Math.round(Number(n) * 100) / 100;

// ------------------------------------------------------------
// Calcul du compte de caisse d'une journée
//   argent attendu = reste d'hier (fonds d'ouverture)
//                  + argent reçu des clients
//                  - monnaie rendue aux clients
//                  + autres entrées - sorties
// ------------------------------------------------------------
const SELECT_JOURNEES = `
  SELECT j.id_journee, DATE_FORMAT(j.date_journee, '%Y-%m-%d') AS date_journee, j.statut,
         j.fonds_ouverture, j.attendu_ouverture, j.ecart_ouverture, j.note_ouverture, j.date_ouverture,
         j.attendu_cloture, j.montant_compte, j.ecart_cloture, j.montant_retire, j.fonds_reportes,
         j.note_cloture, j.date_cloture,
         uo.nom AS ouvert_par, uc.nom AS cloture_par,
         (SELECT COUNT(*) FROM VENTES v
           WHERE DATE(v.date_vente) = j.date_journee) AS nb_ventes,
         (SELECT COALESCE(SUM(v.montant_recu), 0) FROM VENTES v
           WHERE DATE(v.date_vente) = j.date_journee) AS argent_recu,
         (SELECT COALESCE(SUM(v.monnaie_rendue), 0) FROM VENTES v
           WHERE DATE(v.date_vente) = j.date_journee) AS monnaie_rendue,
         (SELECT COALESCE(SUM(m.montant), 0) FROM MOUVEMENTS_CAISSE m
           WHERE m.id_journee = j.id_journee AND m.type_mouvement = 'ENTREE') AS entrees,
         (SELECT COALESCE(SUM(m.montant), 0) FROM MOUVEMENTS_CAISSE m
           WHERE m.id_journee = j.id_journee AND m.type_mouvement = 'SORTIE') AS sorties
  FROM JOURNEES_CAISSE j
  JOIN UTILISATEURS uo ON uo.id_utilisateur = j.id_utilisateur_ouverture
  LEFT JOIN UTILISATEURS uc ON uc.id_utilisateur = j.id_utilisateur_cloture`;

function enrichir(r) {
  const recu = Number(r.argent_recu);
  const rendu = Number(r.monnaie_rendue);
  const entrees = Number(r.entrees);
  const sorties = Number(r.sorties);
  const ventes = arrondi(recu - rendu); // montant net des ventes encaissées
  return {
    ...r,
    nb_ventes: Number(r.nb_ventes),
    argent_recu: recu,
    monnaie_rendue: rendu,
    entrees,
    sorties,
    ventes,
    attendu_actuel: arrondi(Number(r.fonds_ouverture) + ventes + entrees - sorties),
  };
}

async function chargerJournees(where, params = []) {
  const [rows] = await pool.query(`${SELECT_JOURNEES} ${where} ORDER BY j.date_journee DESC`, params);
  return rows.map(enrichir);
}

// Ce qui est resté dans la caisse la veille (dernière journée avant aujourd'hui)
async function veille() {
  const [rows] = await pool.query(
    `SELECT DATE_FORMAT(date_journee, '%Y-%m-%d') AS date_journee, statut, fonds_reportes
     FROM JOURNEES_CAISSE
     WHERE date_journee < CURDATE()
     ORDER BY date_journee DESC
     LIMIT 1`
  );
  if (!rows.length) return { existe: false, cloturee: false, reste: null, date: null };
  const r = rows[0];
  const cloturee = r.statut === 'CLOTUREE';
  return {
    existe: true,
    cloturee,
    reste: cloturee ? Number(r.fonds_reportes) : null,
    date: r.date_journee,
  };
}

async function etatDuJour() {
  const [[d]] = await pool.query("SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS date");
  const journees = await chargerJournees('WHERE j.date_journee = CURDATE()');
  return { date: d.date, journee: journees[0] || null, veille: await veille() };
}

function erreur(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

function repondreErreur(res, err) {
  if (err.status) return res.status(err.status).json({ message: err.message });
  console.error(err);
  return res.status(500).json({ message: 'Erreur serveur' });
}

// Lit un montant : vide ou invalide -> erreur
function lireMontant(valeur, libelle, { positif = false } = {}) {
  if (valeur === undefined || valeur === null || String(valeur).trim() === '') {
    throw erreur(400, `${libelle} : montant requis`);
  }
  const n = Number(String(valeur).replace(/\s/g, '').replace(',', '.'));
  if (isNaN(n) || n < 0 || (positif && n === 0)) {
    throw erreur(400, `${libelle} : montant invalide`);
  }
  return arrondi(n);
}

const texteCourt = (v, max) => {
  const t = (v || '').toString().trim().slice(0, max);
  return t || null;
};

// ------------------------------------------------------------
// État de la caisse d'aujourd'hui
// ------------------------------------------------------------
router.get('/aujourdhui', async (req, res) => {
  try {
    res.json(await etatDuJour());
  } catch (err) {
    repondreErreur(res, err);
  }
});

// ------------------------------------------------------------
// Ouverture : on compte l'argent présent dans la caisse au premier lancement de la journée.
// Le « reste d'hier » (noté hier soir) et l'argent à l'ouverture sont deux informations
// séparées : on ne compare rien et on ne corrige rien, la journée part de l'argent compté.
// Body : { argent_ouverture, note? }
// ------------------------------------------------------------
router.post('/ouvrir', async (req, res) => {
  try {
    const compte = lireMontant(req.body.argent_ouverture ?? req.body.reste_hier, 'Argent à l’ouverture');
    const note = texteCourt(req.body.note, 255);

    const v = await veille();
    const attendu = v.reste; // reste noté hier soir (null s'il est inconnu) : simple information
    const ecart = null; // aucun écart n'est calculé

    await pool.query(
      `INSERT INTO JOURNEES_CAISSE
         (date_journee, fonds_ouverture, attendu_ouverture, ecart_ouverture, note_ouverture, id_utilisateur_ouverture)
       VALUES (CURDATE(), ?, ?, ?, ?, ?)`,
      [compte, attendu, ecart, note, req.user.id]
    );
    res.status(201).json(await etatDuJour());
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'La caisse du jour est déjà ouverte' });
    }
    repondreErreur(res, err);
  }
});

// ------------------------------------------------------------
// Entrées et sorties d'argent (paiement d'un fournisseur, dépense...)
// ------------------------------------------------------------
router.get('/mouvements', async (req, res) => {
  try {
    let idJournee = req.query.journee;
    if (!idJournee) {
      const [j] = await pool.query('SELECT id_journee FROM JOURNEES_CAISSE WHERE date_journee = CURDATE()');
      if (!j.length) return res.json([]);
      idJournee = j[0].id_journee;
    }
    const [rows] = await pool.query(
      `SELECT m.id_mouvement, m.type_mouvement, m.montant, m.motif, m.date_mouvement,
              u.nom AS utilisateur
       FROM MOUVEMENTS_CAISSE m
       JOIN UTILISATEURS u ON u.id_utilisateur = m.id_utilisateur
       WHERE m.id_journee = ?
       ORDER BY m.date_mouvement DESC, m.id_mouvement DESC`,
      [idJournee]
    );
    res.json(rows);
  } catch (err) {
    repondreErreur(res, err);
  }
});

router.post('/mouvements', async (req, res) => {
  try {
    const { type, montant, motif } = req.body;
    const t = type === 'ENTREE' ? 'ENTREE' : type === 'SORTIE' ? 'SORTIE' : null;
    if (!t) throw erreur(400, 'Type de mouvement invalide');
    const m = lireMontant(montant, 'Montant', { positif: true });
    const raison = texteCourt(motif, 150);
    if (!raison) throw erreur(400, 'Indiquez le motif');

    const [j] = await pool.query(
      'SELECT id_journee, statut FROM JOURNEES_CAISSE WHERE date_journee = CURDATE()'
    );
    if (!j.length) throw erreur(409, 'Ouvrez d’abord la caisse du jour');
    if (j[0].statut !== 'OUVERTE') throw erreur(409, 'La journée est déjà clôturée');

    const [r] = await pool.query(
      `INSERT INTO MOUVEMENTS_CAISSE (id_journee, type_mouvement, montant, motif, id_utilisateur)
       VALUES (?, ?, ?, ?, ?)`,
      [j[0].id_journee, t, m, raison, req.user.id]
    );
    res.status(201).json({ id_mouvement: r.insertId });
  } catch (err) {
    repondreErreur(res, err);
  }
});

router.delete('/mouvements/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT m.id_mouvement, j.statut
       FROM MOUVEMENTS_CAISSE m
       JOIN JOURNEES_CAISSE j ON j.id_journee = m.id_journee
       WHERE m.id_mouvement = ?`,
      [req.params.id]
    );
    if (!rows.length) throw erreur(404, 'Mouvement introuvable');
    if (rows[0].statut !== 'OUVERTE') throw erreur(409, 'La journée est clôturée : impossible de supprimer');
    await pool.query('DELETE FROM MOUVEMENTS_CAISSE WHERE id_mouvement = ?', [req.params.id]);
    res.json({ message: 'Mouvement supprimé' });
  } catch (err) {
    repondreErreur(res, err);
  }
});

// ------------------------------------------------------------
// Clôture du soir
// Body : { reste_caisse, note? }
//   Les gros billets sont mis de côté sans être comptés. On compte seulement les petits
//   billets qui restent dans la caisse : c'est le « reste » qui sera redemandé demain matin.
// ------------------------------------------------------------
router.post('/cloturer', async (req, res) => {
  try {
    const reste = lireMontant(req.body.reste_caisse, 'Reste dans la caisse');
    const note = texteCourt(req.body.note, 255);

    const journees = await chargerJournees('WHERE j.date_journee = CURDATE()');
    if (!journees.length) throw erreur(409, 'La caisse du jour n’est pas ouverte');
    const j = journees[0];
    if (j.statut === 'CLOTUREE') throw erreur(409, 'La journée est déjà clôturée');

    const [r] = await pool.query(
      `UPDATE JOURNEES_CAISSE
       SET statut = 'CLOTUREE', attendu_cloture = ?, montant_compte = NULL, ecart_cloture = NULL,
           montant_retire = NULL, fonds_reportes = ?, note_cloture = ?,
           date_cloture = NOW(), id_utilisateur_cloture = ?
       WHERE id_journee = ? AND statut = 'OUVERTE'`,
      [j.attendu_actuel, reste, note, req.user.id, j.id_journee]
    );
    if (!r.affectedRows) throw erreur(409, 'La journée est déjà clôturée');

    res.json(await etatDuJour());
  } catch (err) {
    repondreErreur(res, err);
  }
});

// Rouvrir la journée en cas d'erreur de clôture
router.post('/rouvrir', async (req, res) => {
  try {
    const [r] = await pool.query(
      `UPDATE JOURNEES_CAISSE
       SET statut = 'OUVERTE', attendu_cloture = NULL, montant_compte = NULL, ecart_cloture = NULL,
           montant_retire = NULL, fonds_reportes = NULL, note_cloture = NULL,
           date_cloture = NULL, id_utilisateur_cloture = NULL
       WHERE date_journee = CURDATE() AND statut = 'CLOTUREE'`
    );
    if (!r.affectedRows) throw erreur(409, 'Aucune journée clôturée à rouvrir aujourd’hui');
    res.json(await etatDuJour());
  } catch (err) {
    repondreErreur(res, err);
  }
});

// ------------------------------------------------------------
// Historique : GET /api/caisse/historique?periode=mois   ou   ?du=...&au=...
// ------------------------------------------------------------
router.get('/historique', async (req, res) => {
  try {
    const { du, au } = bornes(req.query);
    const journees = await chargerJournees('WHERE j.date_journee >= ? AND j.date_journee <= ?', [du, au]);


    res.json({
      du,
      au,
      totaux: {
        nb_jours: journees.length,
        ventes: arrondi(journees.reduce((s, j) => s + j.ventes, 0)),
      },
      journees,
    });
  } catch (err) {
    repondreErreur(res, err);
  }
});

module.exports = router;