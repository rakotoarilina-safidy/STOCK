const express = require('express');
const crypto = require('crypto');
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

const arrondi = (n) => Math.round(n * 100) / 100;

function repondreErreur(res, err) {
  if (err.status) return res.status(err.status).json({ message: err.message });
  console.error(err);
  return res.status(500).json({ message: 'Erreur serveur' });
}

// Données complètes d'une facture (sans aucun prix d'achat)
async function chargerFacture(db, id) {
  const [ventes] = await db.query(
    `SELECT v.id_vente, v.numero_facture, v.date_vente, v.date_facture, v.type_vente,
            v.montant_recu, v.monnaie_rendue, u.nom AS caissier
     FROM VENTES v
     JOIN UTILISATEURS u ON u.id_utilisateur = v.id_utilisateur
     WHERE v.id_vente = ?`,
    [id]
  );
  if (!ventes.length) return null;

  const [lignes] = await db.query(
    `SELECT d.id_article, a.designation, d.quantite_vendue, d.prix_unitaire_applique, d.type_prix,
            (d.quantite_vendue * d.prix_unitaire_applique) AS total_ligne
     FROM DETAILS_VENTES d
     JOIN ARTICLES a ON a.id_article = d.id_article
     WHERE d.id_vente = ?
     ORDER BY d.id_detail_vente`,
    [id]
  );
  const total = arrondi(lignes.reduce((s, l) => s + Number(l.total_ligne), 0));
  return { ...ventes[0], lignes, total };
}

// Vérifie et nettoie le panier envoyé : [{ id_article, quantite, en_gros }]
function validerLignes(lignes) {
  if (!Array.isArray(lignes) || lignes.length === 0) throw erreur(400, 'Le panier est vide');
  return lignes
    .map((l) => {
      const qte = Number(l.quantite);
      if (!l.id_article || !Number.isInteger(qte) || qte <= 0) {
        throw erreur(400, 'Chaque ligne doit avoir un article et une quantité entière > 0');
      }
      return { id_article: Number(l.id_article), quantite: qte, en_gros: l.en_gros === true };
    })
    // Tri par article : évite les blocages si deux caisses vendent en même temps
    .sort((a, b) => a.id_article - b.id_article);
}

function lireMontantRecu(valeur) {
  const n = Number(valeur);
  if (valeur === undefined || valeur === null || String(valeur).trim() === '' || isNaN(n) || n < 0) {
    throw erreur(400, 'Le montant donné par le client est invalide');
  }
  return n;
}

// Enregistre les lignes d'une vente et retire les quantités du stock.
// anciennes : lignes d'avant, pour garder leurs prix si on modifie une vente
//             (Map « idArticle:TYPE » -> { prix, prixAchat }).
async function remplirVente(conn, idVente, lignes, recu, anciennes = new Map()) {
  let total = 0;
  let nbGros = 0;

  for (const l of lignes) {
    // Verrouille l'article le temps de la vente pour garder un stock exact
    const [arts] = await conn.query(
      `SELECT id_article, designation, prix_achat, prix_vente_detail, prix_vente_gros, quantite_stock
       FROM ARTICLES WHERE id_article = ? FOR UPDATE`,
      [l.id_article]
    );
    if (!arts.length) throw erreur(404, `Article introuvable (id ${l.id_article})`);
    const art = arts[0];

    if (art.quantite_stock < l.quantite) {
      throw erreur(
        409,
        `Stock insuffisant pour « ${art.designation} » : ${art.quantite_stock} restant(s)`
      );
    }

    // Le prix vient toujours de la base, jamais du navigateur.
    // Une ligne déjà présente avant la modification garde son prix d'origine.
    const type = l.en_gros ? 'GROS' : 'DETAIL';
    const ancienne = anciennes.get(`${l.id_article}:${type}`);
    const prix = ancienne ? ancienne.prix : l.en_gros ? art.prix_vente_gros : art.prix_vente_detail;
    const prixAchat = ancienne ? ancienne.prixAchat : art.prix_achat;
    if (!(prix > 0)) {
      throw erreur(
        400,
        `Aucun prix de vente ${l.en_gros ? 'de gros' : 'de détail'} défini pour « ${art.designation} »`
      );
    }
    if (l.en_gros) nbGros += 1;

    await conn.query(
      `INSERT INTO DETAILS_VENTES
         (quantite_vendue, prix_unitaire_applique, type_prix, prix_achat_unitaire, id_vente, id_article)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [l.quantite, prix, type, prixAchat, idVente, art.id_article]
    );
    await conn.query(
      'UPDATE ARTICLES SET quantite_stock = quantite_stock - ? WHERE id_article = ?',
      [l.quantite, art.id_article]
    );
    total += l.quantite * prix;
  }

  total = arrondi(total);
  if (recu < total) throw erreur(400, `Montant insuffisant : total ${total}, reçu ${recu}`);

  return {
    total,
    monnaie: arrondi(recu - total),
    typeVente: nbGros === 0 ? 'DETAIL' : nbGros === lignes.length ? 'GROS' : 'MIXTE',
  };
}

// Une vente ne peut être modifiée ou supprimée que le jour même, tant que la caisse n'est pas clôturée
// (sinon les comptes d'une journée déjà bouclée changeraient).
async function verifierModifiable(conn, idVente) {
  const [rows] = await conn.query(
    `SELECT id_vente, numero_facture, (DATE(date_vente) = CURDATE()) AS aujourdhui
     FROM VENTES WHERE id_vente = ? FOR UPDATE`,
    [idVente]
  );
  if (!rows.length) throw erreur(404, 'Vente introuvable');
  if (!rows[0].aujourdhui) {
    throw erreur(409, 'Seules les ventes d’aujourd’hui peuvent être modifiées ou supprimées');
  }
  const [j] = await conn.query('SELECT statut FROM JOURNEES_CAISSE WHERE date_journee = CURDATE()');
  if (j.length && j[0].statut === 'CLOTUREE') {
    throw erreur(
      409,
      'La caisse d’aujourd’hui est clôturée : rouvrez-la avant de modifier ou supprimer une vente'
    );
  }
  return rows[0];
}

// Remet en stock les quantités d'une vente et renvoie ses anciennes lignes
async function restituerStock(conn, idVente) {
  const [anciennes] = await conn.query(
    `SELECT id_article, quantite_vendue, type_prix, prix_unitaire_applique, prix_achat_unitaire
     FROM DETAILS_VENTES WHERE id_vente = ? ORDER BY id_article`,
    [idVente]
  );
  for (const a of anciennes) {
    await conn.query('UPDATE ARTICLES SET quantite_stock = quantite_stock + ? WHERE id_article = ?', [
      a.quantite_vendue,
      a.id_article,
    ]);
  }
  return anciennes;
}

// ------------------------------------------------------------
// Enregistrer une vente
// Body : { montant_recu, lignes: [{ id_article, quantite, en_gros }] }
// ------------------------------------------------------------
router.post('/', async (req, res) => {
  let recu;
  let lignes;
  try {
    recu = lireMontantRecu(req.body.montant_recu);
    lignes = validerLignes(req.body.lignes);
  } catch (err) {
    return repondreErreur(res, err);
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Numéro provisoire (unique), remplacé par le vrai numéro de facture en fin de vente
    const provisoire = 'T' + crypto.randomBytes(8).toString('hex');
    const [vente] = await conn.query(
      `INSERT INTO VENTES (numero_facture, date_facture, type_vente, id_utilisateur)
       VALUES (?, NOW(), 'DETAIL', ?)`,
      [provisoire, req.user.id]
    );
    const idVente = vente.insertId;

    const { monnaie, typeVente } = await remplirVente(conn, idVente, lignes, recu);
    const numero = `F${new Date().getFullYear()}-${String(idVente).padStart(6, '0')}`;

    await conn.query(
      'UPDATE VENTES SET numero_facture = ?, type_vente = ?, montant_recu = ?, monnaie_rendue = ? WHERE id_vente = ?',
      [numero, typeVente, recu, monnaie, idVente]
    );

    await conn.commit();
    res.status(201).json(await chargerFacture(pool, idVente));
  } catch (err) {
    await conn.rollback();
    repondreErreur(res, err);
  } finally {
    conn.release();
  }
});

// ------------------------------------------------------------
// Modifier une vente (le client change d'avis) : même corps que l'enregistrement.
// Le stock est remis à jour : les anciennes quantités reviennent, les nouvelles sortent.
// Le numéro de facture, la date et le caissier d'origine sont conservés.
// ------------------------------------------------------------
router.put('/:id', async (req, res) => {
  let recu;
  let lignes;
  try {
    recu = lireMontantRecu(req.body.montant_recu);
    lignes = validerLignes(req.body.lignes);
  } catch (err) {
    return repondreErreur(res, err);
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const v = await verifierModifiable(conn, req.params.id);

    const anciennesLignes = await restituerStock(conn, v.id_vente);
    const memoire = new Map(
      anciennesLignes.map((a) => [
        `${a.id_article}:${a.type_prix}`,
        { prix: a.prix_unitaire_applique, prixAchat: a.prix_achat_unitaire },
      ])
    );
    await conn.query('DELETE FROM DETAILS_VENTES WHERE id_vente = ?', [v.id_vente]);

    const { monnaie, typeVente } = await remplirVente(conn, v.id_vente, lignes, recu, memoire);
    await conn.query(
      'UPDATE VENTES SET type_vente = ?, montant_recu = ?, monnaie_rendue = ? WHERE id_vente = ?',
      [typeVente, recu, monnaie, v.id_vente]
    );

    await conn.commit();
    res.json(await chargerFacture(pool, v.id_vente));
  } catch (err) {
    await conn.rollback();
    repondreErreur(res, err);
  } finally {
    conn.release();
  }
});

// ------------------------------------------------------------
// Supprimer une vente (le client annule) : le stock est remis à jour
// ------------------------------------------------------------
router.delete('/:id', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const v = await verifierModifiable(conn, req.params.id);
    await restituerStock(conn, v.id_vente);
    await conn.query('DELETE FROM VENTES WHERE id_vente = ?', [v.id_vente]); // les lignes partent avec
    await conn.commit();
    res.json({ message: `La vente ${v.numero_facture} est supprimée, le stock a été remis à jour` });
  } catch (err) {
    await conn.rollback();
    repondreErreur(res, err);
  } finally {
    conn.release();
  }
});

// ------------------------------------------------------------
// Liste des factures
// GET /api/ventes?periode=jour|semaine|mois|annee   ou   ?du=2026-10-01&au=2026-10-31
// Sans paramètre : factures d'aujourd'hui. Tout le monde voit toutes les factures.
// ------------------------------------------------------------
router.get('/', async (req, res) => {
  try {
    const { du, au } = bornes(req.query);
    const [rows] = await pool.query(
      `SELECT t.id_vente, t.numero_facture, t.date_vente, t.type_vente, t.montant_total,
              u.nom AS caissier
       FROM V_VENTES_TOTAUX t
       JOIN VENTES v ON v.id_vente = t.id_vente
       JOIN UTILISATEURS u ON u.id_utilisateur = v.id_utilisateur
       WHERE v.date_vente >= ? AND v.date_vente < DATE_ADD(?, INTERVAL 1 DAY)
       ORDER BY t.date_vente DESC, t.id_vente DESC`,
      [du, au]
    );
    const total_periode = arrondi(rows.reduce((s, r) => s + Number(r.montant_total || 0), 0));
    res.json({ du, au, total_periode, ventes: rows });
  } catch (err) {
    repondreErreur(res, err);
  }
});

// Ventes regroupées par jour : une ligne par jour qui a des ventes
// GET /api/ventes/par-jour?du=2026-10-01&au=2026-10-31
router.get('/par-jour', async (req, res) => {
  try {
    const { du, au } = bornes(req.query);
    const [rows] = await pool.query(
      `SELECT DATE_FORMAT(v.date_vente, '%Y-%m-%d') AS date,
              COUNT(DISTINCT v.id_vente) AS nb_ventes,
              SUM(d.quantite_vendue) AS quantite_vendue,
              SUM(d.quantite_vendue * d.prix_unitaire_applique) AS total
       FROM VENTES v
       JOIN DETAILS_VENTES d ON d.id_vente = v.id_vente
       WHERE v.date_vente >= ? AND v.date_vente < DATE_ADD(?, INTERVAL 1 DAY)
       GROUP BY date
       ORDER BY date`,
      [du, au]
    );
    res.json({
      du,
      au,
      jours: rows.map((r) => ({
        date: r.date,
        nb_ventes: Number(r.nb_ventes),
        quantite_vendue: Number(r.quantite_vendue),
        total: arrondi(Number(r.total)),
      })),
    });
  } catch (err) {
    repondreErreur(res, err);
  }
});

// Historique détaillé : article par article (même filtres de période)
// Le bénéfice de chaque ligne n'est fourni qu'à la responsable.
router.get('/historique', async (req, res) => {
  try {
    const { du, au } = bornes(req.query);
    const voir = req.user.role === 'RESPONSABLE';
    const [rows] = await pool.query(
      `SELECT v.id_vente, v.numero_facture, v.date_vente, v.type_vente,
              u.nom AS caissier, a.designation,
              d.quantite_vendue, d.prix_unitaire_applique, d.type_prix,
              (d.quantite_vendue * d.prix_unitaire_applique) AS total_ligne,
              (d.quantite_vendue * (d.prix_unitaire_applique - d.prix_achat_unitaire)) AS benefice_ligne
       FROM DETAILS_VENTES d
       JOIN VENTES v ON v.id_vente = d.id_vente
       JOIN UTILISATEURS u ON u.id_utilisateur = v.id_utilisateur
       JOIN ARTICLES a ON a.id_article = d.id_article
       WHERE v.date_vente >= ? AND v.date_vente < DATE_ADD(?, INTERVAL 1 DAY)
       ORDER BY v.date_vente DESC, v.id_vente DESC, d.id_detail_vente`,
      [du, au]
    );
    const lignes = rows.map((r) => {
      if (!voir) delete r.benefice_ligne;
      return r;
    });
    res.json({ du, au, lignes });
  } catch (err) {
    repondreErreur(res, err);
  }
});

// Une facture (pour la réimprimer)
router.get('/:id', async (req, res) => {
  try {
    const facture = await chargerFacture(pool, req.params.id);
    if (!facture) return res.status(404).json({ message: 'Vente introuvable' });
    res.json(facture);
  } catch (err) {
    repondreErreur(res, err);
  }
});

module.exports = router;