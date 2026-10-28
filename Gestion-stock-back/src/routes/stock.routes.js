const express = require('express');
const pool = require('../config/db');
const { authentifier, autoriser } = require('../middleware/auth');

const router = express.Router();
// Corriger la quantité en stock : uniquement la responsable
router.use(authentifier, autoriser('RESPONSABLE'));

function erreur(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

// Ajuster le stock d'un produit (stock manquant ou en trop après un comptage)
// Body : { id_article, nouvelle_quantite, motif }
router.post('/ajuster', async (req, res) => {
  const { id_article, nouvelle_quantite, motif } = req.body;
  const quantite = Number(nouvelle_quantite);

  if (
    !id_article ||
    nouvelle_quantite === undefined ||
    String(nouvelle_quantite).trim() === '' ||
    !Number.isInteger(quantite) ||
    quantite < 0
  ) {
    return res
      .status(400)
      .json({ message: 'Le nouveau stock doit être un nombre entier positif ou nul' });
  }
  const raison = (motif || '').toString().trim().slice(0, 150);
  if (!raison) return res.status(400).json({ message: 'Indiquez le motif de la correction' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Verrouille le produit pour ne pas se croiser avec une vente en cours
    const [rows] = await conn.query(
      'SELECT designation, quantite_stock FROM ARTICLES WHERE id_article = ? FOR UPDATE',
      [id_article]
    );
    if (!rows.length) throw erreur(404, 'Produit introuvable');

    const avant = rows[0].quantite_stock;
    if (avant === quantite) {
      throw erreur(400, `Le stock de « ${rows[0].designation} » est déjà de ${avant}`);
    }

    await conn.query('UPDATE ARTICLES SET quantite_stock = ? WHERE id_article = ?', [
      quantite,
      id_article,
    ]);
    await conn.query(
      `INSERT INTO AJUSTEMENTS_STOCK (id_article, quantite_avant, quantite_apres, motif, id_utilisateur)
       VALUES (?, ?, ?, ?, ?)`,
      [id_article, avant, quantite, raison, req.user.id]
    );

    await conn.commit();
    res.status(201).json({ designation: rows[0].designation, avant, apres: quantite });
  } catch (err) {
    await conn.rollback();
    if (err.status) return res.status(err.status).json({ message: err.message });
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  } finally {
    conn.release();
  }
});

// Historique des corrections : GET /api/stock/ajustements?limite=20
router.get('/ajustements', async (req, res) => {
  try {
    const limite = Math.min(Math.max(parseInt(req.query.limite, 10) || 20, 1), 200);
    const [rows] = await pool.query(
      `SELECT s.id_ajustement, s.date_ajustement, a.designation,
              s.quantite_avant, s.quantite_apres,
              (s.quantite_apres - s.quantite_avant) AS difference,
              s.motif, u.nom AS utilisateur
       FROM AJUSTEMENTS_STOCK s
       JOIN ARTICLES a ON a.id_article = s.id_article
       JOIN UTILISATEURS u ON u.id_utilisateur = s.id_utilisateur
       ORDER BY s.date_ajustement DESC, s.id_ajustement DESC
       LIMIT ?`,
      [limite]
    );
    res.json(rows.map((r) => ({ ...r, difference: Number(r.difference) })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;