const express = require('express');
const pool = require('../config/db');
const { authentifier } = require('../middleware/auth');

const router = express.Router();
router.use(authentifier);

// Liste des catégories, « Autres » en dernier
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT c.id_categorie, c.nom_categorie, COUNT(a.id_article) AS nb_articles
       FROM CATEGORIES c
       LEFT JOIN ARTICLES a ON a.id_categorie = c.id_categorie
       GROUP BY c.id_categorie, c.nom_categorie
       ORDER BY (c.nom_categorie = 'Autres'), c.nom_categorie`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;