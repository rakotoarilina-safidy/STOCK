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
    `SELECT a.designation, d.quantite_vendue, d.prix_unitaire_applique,
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

// Enregistrer une vente
// Body : { type_vente: 'DETAIL' | 'GROS', montant_recu, lignes: [{ id_article, quantite }] }
router.post('/', async (req, res) => {
  const { type_vente, montant_recu, lignes } = req.body;
  const type = type_vente === 'GROS' ? 'GROS' : 'DETAIL';
  const recu = Number(montant_recu);

  if (!Array.isArray(lignes) || lignes.length === 0) {
    return res.status(400).json({ message: 'Le panier est vide' });
  }
  if (montant_recu === undefined || isNaN(recu) || recu < 0) {
    return res.status(400).json({ message: 'Le montant donné par le client est invalide' });
  }
  for (const l of lignes) {
    const qte = Number(l.quantite);
    if (!l.id_article || !Number.isInteger(qte) || qte <= 0) {
      return res
        .status(400)
        .json({ message: 'Chaque ligne doit avoir un article et une quantité entière > 0' });
    }
  }

  // Tri par article : évite les blocages si deux caisses vendent en même temps
  const tri = [...lignes].sort((a, b) => a.id_article - b.id_article);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Numéro provisoire (unique), remplacé par le vrai numéro de facture en fin de vente
    const provisoire = 'T' + crypto.randomBytes(8).toString('hex');
    const [vente] = await conn.query(
      `INSERT INTO VENTES (numero_facture, date_facture, type_vente, id_utilisateur)
       VALUES (?, NOW(), ?, ?)`,
      [provisoire, type, req.user.id]
    );
    const idVente = vente.insertId;

    let total = 0;
    for (const l of tri) {
      const qte = Number(l.quantite);

      // Verrouille l'article le temps de la vente pour garder un stock exact
      const [arts] = await conn.query(
        `SELECT id_article, designation, prix_achat, prix_vente_detail, prix_vente_gros, quantite_stock
         FROM ARTICLES WHERE id_article = ? FOR UPDATE`,
        [l.id_article]
      );
      if (!arts.length) throw erreur(404, `Article introuvable (id ${l.id_article})`);
      const art = arts[0];

      if (art.quantite_stock < qte) {
        throw erreur(
          409,
          `Stock insuffisant pour « ${art.designation} » : ${art.quantite_stock} restant(s)`
        );
      }

      // Le prix vient toujours de la base, jamais du navigateur
      const prix = type === 'GROS' ? art.prix_vente_gros : art.prix_vente_detail;
      if (!(prix > 0)) {
        throw erreur(
          400,
          `Aucun prix de vente ${type.toLowerCase()} défini pour « ${art.designation} »`
        );
      }

      await conn.query(
        `INSERT INTO DETAILS_VENTES
           (quantite_vendue, prix_unitaire_applique, prix_achat_unitaire, id_vente, id_article)
         VALUES (?, ?, ?, ?, ?)`,
        [qte, prix, art.prix_achat, idVente, art.id_article]
      );
      await conn.query(
        'UPDATE ARTICLES SET quantite_stock = quantite_stock - ? WHERE id_article = ?',
        [qte, art.id_article]
      );
      total += qte * prix;
    }

    total = arrondi(total);
    if (recu < total) {
      throw erreur(400, `Montant insuffisant : total ${total}, reçu ${recu}`);
    }
    const monnaie = arrondi(recu - total);
    const numero = `F${new Date().getFullYear()}-${String(idVente).padStart(6, '0')}`;

    await conn.query(
      'UPDATE VENTES SET numero_facture = ?, montant_recu = ?, monnaie_rendue = ? WHERE id_vente = ?',
      [numero, recu, monnaie, idVente]
    );

    await conn.commit();
    res.status(201).json(await chargerFacture(pool, idVente));
  } catch (err) {
    await conn.rollback();
    if (err.status) return res.status(err.status).json({ message: err.message });
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  } finally {
    conn.release();
  }
});

// Liste des factures
// GET /api/ventes?periode=jour|semaine|mois|annee   ou   ?du=2026-10-01&au=2026-10-31
// Sans paramètre : factures d'aujourd'hui. Tout le monde voit toutes les factures.
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
    const total_periode =
      Math.round(rows.reduce((s, r) => s + Number(r.montant_total || 0), 0) * 100) / 100;
    res.json({ du, au, total_periode, ventes: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
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
              d.quantite_vendue, d.prix_unitaire_applique,
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
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Une facture (pour la réimprimer)
router.get('/:id', async (req, res) => {
  try {
    const facture = await chargerFacture(pool, req.params.id);
    if (!facture) return res.status(404).json({ message: 'Vente introuvable' });
    res.json(facture);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;