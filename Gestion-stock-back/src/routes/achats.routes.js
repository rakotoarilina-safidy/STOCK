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

// Enregistrer une livraison (approvisionnement)
// Body : { id_fournisseur, date_approvisionnement (optionnel, AAAA-MM-JJ),
//          lignes: [{ id_article, quantite, prix_achat_unitaire }] }
router.post('/', async (req, res) => {
  const { id_fournisseur, date_approvisionnement, lignes } = req.body;

  if (!id_fournisseur || !Array.isArray(lignes) || lignes.length === 0) {
    return res
      .status(400)
      .json({ message: 'Un fournisseur et au moins une ligne sont requis' });
  }
  for (const l of lignes) {
    const qte = Number(l.quantite);
    const prix = Number(l.prix_achat_unitaire);
    if (!l.id_article || !Number.isInteger(qte) || qte <= 0 || isNaN(prix) || prix < 0) {
      return res.status(400).json({
        message: 'Chaque ligne doit avoir un article, une quantité entière > 0 et un prix >= 0',
      });
    }
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [f] = await conn.query('SELECT 1 FROM FOURNISSEURS WHERE id_fournisseur = ?', [
      id_fournisseur,
    ]);
    if (!f.length) throw erreur(404, 'Fournisseur introuvable');

    const [achat] = await conn.query(
      'INSERT INTO ACHATS (date_approvisionnement, id_fournisseur, id_utilisateur) VALUES (COALESCE(?, CURDATE()), ?, ?)',
      [date_approvisionnement || null, id_fournisseur, req.user.id]
    );

    for (const l of lignes) {
      await conn.query(
        `INSERT INTO DETAILS_ACHATS (quantite_achetee, prix_achat_unitaire, id_achat, id_article)
         VALUES (?, ?, ?, ?)`,
        [l.quantite, l.prix_achat_unitaire, achat.insertId, l.id_article]
      );
      // Le stock augmente et le prix d'achat de l'article devient le dernier prix payé
      const [maj] = await conn.query(
        'UPDATE ARTICLES SET quantite_stock = quantite_stock + ?, prix_achat = ? WHERE id_article = ?',
        [l.quantite, l.prix_achat_unitaire, l.id_article]
      );
      if (!maj.affectedRows) throw erreur(404, `Article introuvable (id ${l.id_article})`);
    }

    await conn.commit();
    res.status(201).json({ id_achat: achat.insertId });
  } catch (err) {
    await conn.rollback();
    if (err.status) return res.status(err.status).json({ message: err.message });
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  } finally {
    conn.release();
  }
});

// Liste des livraisons
// GET /api/achats?periode=mois   |   ?du=2026-10-01&au=2026-10-31   |   ?id_fournisseur=1
// Sans filtre de date : toutes les livraisons
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
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Détail d'une livraison
router.get('/:id', async (req, res) => {
  try {
    const [achats] = await pool.query(
      `SELECT a.id_achat, a.date_approvisionnement, f.nom_fournisseur, u.nom AS utilisateur
       FROM ACHATS a
       JOIN FOURNISSEURS f ON f.id_fournisseur = a.id_fournisseur
       JOIN UTILISATEURS u ON u.id_utilisateur = a.id_utilisateur
       WHERE a.id_achat = ?`,
      [req.params.id]
    );
    if (!achats.length) return res.status(404).json({ message: 'Achat introuvable' });

    const [lignes] = await pool.query(
      `SELECT ar.designation, d.quantite_achetee, d.prix_achat_unitaire,
              (d.quantite_achetee * d.prix_achat_unitaire) AS total_ligne
       FROM DETAILS_ACHATS d
       JOIN ARTICLES ar ON ar.id_article = d.id_article
       WHERE d.id_achat = ?`,
      [req.params.id]
    );
    res.json({ ...achats[0], lignes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;