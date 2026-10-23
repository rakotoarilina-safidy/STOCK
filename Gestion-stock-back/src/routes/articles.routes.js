const express = require('express');
const pool = require('../config/db');
const { authentifier } = require('../middleware/auth');

const router = express.Router();
router.use(authentifier);

const COLONNES =
  'id_article, designation, prix_achat, prix_vente_detail, prix_vente_gros, quantite_stock, seuil_alerte, date_ajout';

function validerPrix(b) {
  const champs = ['prix_achat', 'prix_vente_detail', 'prix_vente_gros'];
  return champs.every((c) => b[c] === undefined || (!isNaN(b[c]) && Number(b[c]) >= 0));
}

// Liste + recherche : GET /api/articles?q=riz&stock_bas=1
router.get('/', async (req, res) => {
  try {
    const conditions = [];
    const params = [];
    if (req.query.q) {
      conditions.push('designation LIKE ?');
      params.push(`%${req.query.q}%`);
    }
    if (req.query.stock_bas === '1') {
      conditions.push('quantite_stock <= seuil_alerte');
    }
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const [rows] = await pool.query(
      `SELECT ${COLONNES} FROM ARTICLES ${where} ORDER BY designation`,
      params
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Un article (stock restant)
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(`SELECT ${COLONNES} FROM ARTICLES WHERE id_article = ?`, [
      req.params.id,
    ]);
    if (!rows.length) return res.status(404).json({ message: 'Article introuvable' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Création
router.post('/', async (req, res) => {
  const b = req.body;
  if (!b.designation || !b.designation.trim()) {
    return res.status(400).json({ message: 'La désignation est requise' });
  }
  if (!validerPrix(b)) {
    return res.status(400).json({ message: 'Les prix doivent être des nombres positifs' });
  }
  try {
    const [r] = await pool.query(
      `INSERT INTO ARTICLES (designation, prix_achat, prix_vente_detail, prix_vente_gros, seuil_alerte)
       VALUES (?, ?, ?, ?, ?)`,
      [
        b.designation.trim(),
        b.prix_achat || 0,
        b.prix_vente_detail || 0,
        b.prix_vente_gros || 0,
        b.seuil_alerte || 0,
      ]
    );
    res.status(201).json({ id_article: r.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Modification : le stock n'est pas modifiable ici (il bouge par les ventes et les livraisons)
router.put('/:id', async (req, res) => {
  const b = req.body;
  if (!b.designation || !b.designation.trim()) {
    return res.status(400).json({ message: 'La désignation est requise' });
  }
  if (!validerPrix(b)) {
    return res.status(400).json({ message: 'Les prix doivent être des nombres positifs' });
  }
  try {
    const [r] = await pool.query(
      `UPDATE ARTICLES
       SET designation = ?, prix_achat = ?, prix_vente_detail = ?, prix_vente_gros = ?, seuil_alerte = ?
       WHERE id_article = ?`,
      [
        b.designation.trim(),
        b.prix_achat || 0,
        b.prix_vente_detail || 0,
        b.prix_vente_gros || 0,
        b.seuil_alerte || 0,
        req.params.id,
      ]
    );
    if (!r.affectedRows) return res.status(404).json({ message: 'Article introuvable' });
    res.json({ message: 'Article modifié' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Suppression : refusée si l'article a déjà un historique
router.delete('/:id', async (req, res) => {
  try {
    const [r] = await pool.query('DELETE FROM ARTICLES WHERE id_article = ?', [req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ message: 'Article introuvable' });
    res.json({ message: 'Article supprimé' });
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(409).json({
        message: 'Impossible de supprimer : cet article a déjà des ventes ou des achats',
      });
    }
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;