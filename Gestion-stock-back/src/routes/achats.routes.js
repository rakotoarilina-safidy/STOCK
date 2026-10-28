const express = require('express');
const pool = require('../config/db');
const { authentifier } = require('../middleware/auth');
const { bornes } = require('../utils/periode');

const router = express.Router();
router.use(authentifier);

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

// Fournisseur « Autres » : pour les achats auprès de vendeurs sans nom (petits fournisseurs).
// Il est créé automatiquement la première fois.
async function idFournisseurAutres(conn, idUtilisateur) {
  const [rows] = await conn.query("SELECT id_fournisseur FROM FOURNISSEURS WHERE nom_fournisseur = 'Autres' LIMIT 1");
  if (rows.length) return rows[0].id_fournisseur;
  const [r] = await conn.query(
    'INSERT INTO FOURNISSEURS (nom_fournisseur, telephone, id_utilisateur) VALUES (?, NULL, ?)',
    ['Autres', idUtilisateur]
  );
  return r.insertId;
}

// id_fournisseur peut valoir 'AUTRES' pour un fournisseur sans nom
async function resoudreFournisseur(conn, id, idUtilisateur) {
  if (id === 'AUTRES') return idFournisseurAutres(conn, idUtilisateur);
  const [f] = await conn.query('SELECT 1 FROM FOURNISSEURS WHERE id_fournisseur = ?', [id]);
  if (!f.length) throw erreur(404, 'Fournisseur introuvable');
  return id;
}

// Vérifie le corps d'une livraison : { id_fournisseur, date_approvisionnement?, lignes: [...] }
function validerLivraison(b) {
  const { id_fournisseur, date_approvisionnement, lignes } = b;
  if (!id_fournisseur || !Array.isArray(lignes) || lignes.length === 0) {
    throw erreur(400, 'Un fournisseur et au moins une ligne sont requis');
  }
  const propres = lignes.map((l) => {
    const quantite = Number(l.quantite);
    const prix = Number(l.prix_achat_unitaire);
    if (!l.id_article || !Number.isInteger(quantite) || quantite <= 0 || isNaN(prix) || prix < 0) {
      throw erreur(400, 'Chaque ligne doit avoir un article, une quantité entière > 0 et un prix >= 0');
    }
    return { id_article: Number(l.id_article), quantite, prix };
  });
  return { id_fournisseur, date: date_approvisionnement || null, lignes: propres };
}

// Applique des variations de stock (+ ou -) produit par produit.
// Refuse si le stock deviendrait négatif (une partie a déjà été vendue).
async function appliquerVariations(conn, variations) {
  const ids = [...variations.keys()].sort((a, b) => a - b);
  for (const id of ids) {
    const delta = variations.get(id);
    if (delta === 0) continue;
    const [rows] = await conn.query(
      'SELECT designation, quantite_stock FROM ARTICLES WHERE id_article = ? FOR UPDATE',
      [id]
    );
    if (!rows.length) throw erreur(404, `Article introuvable (id ${id})`);
    const { designation, quantite_stock: stock } = rows[0];
    if (stock + delta < 0) {
      throw erreur(
        409,
        `Impossible : une partie de « ${designation} » a déjà été vendue (stock actuel ${stock}, ` +
          `cette opération en retire ${-delta}). Utilisez « Corriger le stock » si besoin.`
      );
    }
    await conn.query('UPDATE ARTICLES SET quantite_stock = quantite_stock + ? WHERE id_article = ?', [
      delta,
      id,
    ]);
  }
}

// Après une modification ou une suppression, le prix d'achat d'un produit redevient celui de sa
// dernière livraison, mais seulement s'il venait de cette livraison (on ne touche pas à un prix
// modifié à la main).
async function aligner(conn, idAchat, anciens, nouveaux) {
  const ids = new Set([...anciens.keys(), ...nouveaux.keys()]);
  for (const id of ids) {
    const [rows] = await conn.query(
      `SELECT d.id_achat, d.prix_achat_unitaire
       FROM DETAILS_ACHATS d
       JOIN ACHATS a ON a.id_achat = d.id_achat
       WHERE d.id_article = ?
       ORDER BY a.date_approvisionnement DESC, a.id_achat DESC, d.id_detail_achat DESC
       LIMIT 1`,
      [id]
    );
    if (!rows.length) continue; // plus aucune livraison : on laisse le prix tel quel
    const derniere = rows[0];
    if (nouveaux.has(id) && derniere.id_achat === idAchat) {
      await conn.query('UPDATE ARTICLES SET prix_achat = ? WHERE id_article = ?', [
        derniere.prix_achat_unitaire,
        id,
      ]);
    } else if (anciens.has(id)) {
      await conn.query(
        'UPDATE ARTICLES SET prix_achat = ? WHERE id_article = ? AND prix_achat = ?',
        [derniere.prix_achat_unitaire, id, anciens.get(id)]
      );
    }
  }
}

async function lignesActuelles(conn, idAchat) {
  const [rows] = await conn.query(
    'SELECT id_article, quantite_achetee, prix_achat_unitaire FROM DETAILS_ACHATS WHERE id_achat = ?',
    [idAchat]
  );
  return rows;
}

// ------------------------------------------------------------
// Enregistrer une livraison (approvisionnement)
// Body : { id_fournisseur | 'AUTRES', date_approvisionnement?, lignes: [{ id_article, quantite, prix_achat_unitaire }] }
// ------------------------------------------------------------
router.post('/', async (req, res) => {
  let l;
  try {
    l = validerLivraison(req.body);
  } catch (err) {
    return repondreErreur(res, err);
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const idFourn = await resoudreFournisseur(conn, l.id_fournisseur, req.user.id);
    const [achat] = await conn.query(
      'INSERT INTO ACHATS (date_approvisionnement, id_fournisseur, id_utilisateur) VALUES (COALESCE(?, CURDATE()), ?, ?)',
      [l.date, idFourn, req.user.id]
    );

    for (const ligne of [...l.lignes].sort((a, b) => a.id_article - b.id_article)) {
      await conn.query(
        `INSERT INTO DETAILS_ACHATS (quantite_achetee, prix_achat_unitaire, id_achat, id_article)
         VALUES (?, ?, ?, ?)`,
        [ligne.quantite, ligne.prix, achat.insertId, ligne.id_article]
      );
      // Le stock augmente et le prix d'achat de l'article devient le dernier prix payé
      const [maj] = await conn.query(
        'UPDATE ARTICLES SET quantite_stock = quantite_stock + ?, prix_achat = ? WHERE id_article = ?',
        [ligne.quantite, ligne.prix, ligne.id_article]
      );
      if (!maj.affectedRows) throw erreur(404, `Article introuvable (id ${ligne.id_article})`);
    }

    await conn.commit();
    res.status(201).json({ id_achat: achat.insertId });
  } catch (err) {
    await conn.rollback();
    repondreErreur(res, err);
  } finally {
    conn.release();
  }
});

// ------------------------------------------------------------
// Modifier une livraison (erreur de saisie) : même corps que l'enregistrement.
// Le stock est ajusté de la différence, produit par produit.
// ------------------------------------------------------------
router.put('/:id', async (req, res) => {
  let l;
  try {
    l = validerLivraison(req.body);
  } catch (err) {
    return repondreErreur(res, err);
  }
  const id = Number(req.params.id);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [achats] = await conn.query('SELECT id_achat FROM ACHATS WHERE id_achat = ? FOR UPDATE', [id]);
    if (!achats.length) throw erreur(404, 'Livraison introuvable');

    const idFourn = await resoudreFournisseur(conn, l.id_fournisseur, req.user.id);
    const anciennes = await lignesActuelles(conn, id);

    // variation de stock = nouvelle quantité - ancienne quantité
    const variations = new Map();
    const anciensPrix = new Map();
    for (const a of anciennes) {
      variations.set(a.id_article, (variations.get(a.id_article) || 0) - a.quantite_achetee);
      anciensPrix.set(a.id_article, a.prix_achat_unitaire);
    }
    const nouveauxPrix = new Map();
    for (const n of l.lignes) {
      variations.set(n.id_article, (variations.get(n.id_article) || 0) + n.quantite);
      nouveauxPrix.set(n.id_article, n.prix);
    }
    await appliquerVariations(conn, variations);

    await conn.query('DELETE FROM DETAILS_ACHATS WHERE id_achat = ?', [id]);
    for (const n of l.lignes) {
      await conn.query(
        `INSERT INTO DETAILS_ACHATS (quantite_achetee, prix_achat_unitaire, id_achat, id_article)
         VALUES (?, ?, ?, ?)`,
        [n.quantite, n.prix, id, n.id_article]
      );
    }
    await conn.query(
      'UPDATE ACHATS SET id_fournisseur = ?, date_approvisionnement = COALESCE(?, date_approvisionnement) WHERE id_achat = ?',
      [idFourn, l.date, id]
    );
    await aligner(conn, id, anciensPrix, nouveauxPrix);

    await conn.commit();
    res.json({ id_achat: id });
  } catch (err) {
    await conn.rollback();
    repondreErreur(res, err);
  } finally {
    conn.release();
  }
});

// ------------------------------------------------------------
// Supprimer une livraison : les quantités reçues sortent du stock
// (refusé si une partie a déjà été vendue)
// ------------------------------------------------------------
router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [achats] = await conn.query('SELECT id_achat FROM ACHATS WHERE id_achat = ? FOR UPDATE', [id]);
    if (!achats.length) throw erreur(404, 'Livraison introuvable');

    const anciennes = await lignesActuelles(conn, id);
    const variations = new Map();
    const anciensPrix = new Map();
    for (const a of anciennes) {
      variations.set(a.id_article, (variations.get(a.id_article) || 0) - a.quantite_achetee);
      anciensPrix.set(a.id_article, a.prix_achat_unitaire);
    }
    await appliquerVariations(conn, variations);

    await conn.query('DELETE FROM ACHATS WHERE id_achat = ?', [id]); // les lignes partent avec
    await aligner(conn, id, anciensPrix, new Map());

    await conn.commit();
    res.json({ message: 'La livraison est supprimée, le stock a été remis à jour' });
  } catch (err) {
    await conn.rollback();
    repondreErreur(res, err);
  } finally {
    conn.release();
  }
});

// ------------------------------------------------------------
// Liste des livraisons
// GET /api/achats?periode=mois   |   ?du=2026-10-01&au=2026-10-31   |   ?id_fournisseur=1
// Sans filtre de date : toutes les livraisons
// ------------------------------------------------------------
router.get('/', async (req, res) => {
  try {
    const conditions = [];
    const params = [];
    if (req.query.du || req.query.periode) {
      const { du, au } = bornes(req.query);
      conditions.push('t.date_approvisionnement >= ?', 't.date_approvisionnement <= ?');
      params.push(du, au);
    }
    if (req.query.id_fournisseur) {
      conditions.push('t.id_fournisseur = ?');
      params.push(req.query.id_fournisseur);
    }
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const [rows] = await pool.query(
      `SELECT t.id_achat, t.date_approvisionnement, t.id_fournisseur, t.montant_total,
              f.nom_fournisseur
       FROM V_ACHATS_TOTAUX t
       JOIN FOURNISSEURS f ON f.id_fournisseur = t.id_fournisseur
       ${where}
       ORDER BY t.date_approvisionnement DESC, t.id_achat DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    repondreErreur(res, err);
  }
});

// Livraisons regroupées par jour : une ligne par jour qui a des livraisons
// GET /api/achats/par-jour?du=2026-10-01&au=2026-10-31&id_fournisseur=1
router.get('/par-jour', async (req, res) => {
  try {
    const { du, au } = bornes(req.query);
    const params = [du, au];
    let filtre = '';
    if (req.query.id_fournisseur) {
      filtre = 'AND t.id_fournisseur = ?';
      params.push(req.query.id_fournisseur);
    }
    const [rows] = await pool.query(
      `SELECT DATE_FORMAT(t.date_approvisionnement, '%Y-%m-%d') AS date,
              COUNT(*) AS nb_livraisons,
              SUM(t.montant_total) AS total
       FROM V_ACHATS_TOTAUX t
       WHERE t.date_approvisionnement >= ? AND t.date_approvisionnement <= ? ${filtre}
       GROUP BY date
       ORDER BY date`,
      params
    );
    res.json({
      du,
      au,
      jours: rows.map((r) => ({
        date: r.date,
        nb_livraisons: Number(r.nb_livraisons),
        total: Math.round(Number(r.total || 0) * 100) / 100,
      })),
    });
  } catch (err) {
    repondreErreur(res, err);
  }
});

// Détail d'une livraison (assez complet pour pré-remplir le formulaire de modification)
router.get('/:id', async (req, res) => {
  try {
    const [achats] = await pool.query(
      `SELECT a.id_achat, DATE_FORMAT(a.date_approvisionnement, '%Y-%m-%d') AS date_approvisionnement,
              a.id_fournisseur, f.nom_fournisseur, u.nom AS utilisateur
       FROM ACHATS a
       JOIN FOURNISSEURS f ON f.id_fournisseur = a.id_fournisseur
       JOIN UTILISATEURS u ON u.id_utilisateur = a.id_utilisateur
       WHERE a.id_achat = ?`,
      [req.params.id]
    );
    if (!achats.length) return res.status(404).json({ message: 'Achat introuvable' });

    const [lignes] = await pool.query(
      `SELECT d.id_article, ar.designation, d.quantite_achetee, d.prix_achat_unitaire,
              (d.quantite_achetee * d.prix_achat_unitaire) AS total_ligne
       FROM DETAILS_ACHATS d
       JOIN ARTICLES ar ON ar.id_article = d.id_article
       WHERE d.id_achat = ?
       ORDER BY d.id_detail_achat`,
      [req.params.id]
    );
    res.json({ ...achats[0], lignes });
  } catch (err) {
    repondreErreur(res, err);
  }
});

module.exports = router;