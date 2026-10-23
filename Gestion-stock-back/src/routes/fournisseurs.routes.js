const express = require('express');
const pool = require('../config/db');
const { authentifier } = require('../middleware/auth');

const router = express.Router();
router.use(authentifier);

// Liste + recherche : GET /api/fournisseurs?q=tana
router.get('/', async (req, res) => {
  try {
    const params = [];
    let where = '';
    if (req.query.q) {
      where = 'WHERE f.nom_fournisseur LIKE ?';
      params.push(`%${req.query.q}%`);
    }
    const [rows] = await pool.query(
      `SELECT f.id_fournisseur, f.nom_fournisseur, f.telephone, f.date_enregistrement,
              (SELECT MAX(a.date_approvisionnement) FROM ACHATS a
               WHERE a.id_fournisseur = f.id_fournisseur) AS derniere_livraison,
              (SELECT COUNT(*) FROM ACHATS a
               WHERE a.id_fournisseur = f.id_fournisseur) AS nb_livraisons
       FROM FOURNISSEURS f
       ${where}
       ORDER BY f.nom_fournisseur`,
      params
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

router.post('/', async (req, res) => {
  const { nom_fournisseur, telephone } = req.body;
  if (!nom_fournisseur || !nom_fournisseur.trim()) {
    return res.status(400).json({ message: 'Le nom du fournisseur est requis' });
  }
  try {
    const [r] = await pool.query(
      'INSERT INTO FOURNISSEURS (nom_fournisseur, telephone, id_utilisateur) VALUES (?, ?, ?)',
      [nom_fournisseur.trim(), telephone || null, req.user.id]
    );
    res.status(201).json({ id_fournisseur: r.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

router.put('/:id', async (req, res) => {
  const { nom_fournisseur, telephone } = req.body;
  if (!nom_fournisseur || !nom_fournisseur.trim()) {
    return res.status(400).json({ message: 'Le nom du fournisseur est requis' });
  }
  try {
    const [r] = await pool.query(
      'UPDATE FOURNISSEURS SET nom_fournisseur = ?, telephone = ? WHERE id_fournisseur = ?',
      [nom_fournisseur.trim(), telephone || null, req.params.id]
    );
    if (!r.affectedRows) return res.status(404).json({ message: 'Fournisseur introuvable' });
    res.json({ message: 'Fournisseur modifié' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const [r] = await pool.query('DELETE FROM FOURNISSEURS WHERE id_fournisseur = ?', [
      req.params.id,
    ]);
    if (!r.affectedRows) return res.status(404).json({ message: 'Fournisseur introuvable' });
    res.json({ message: 'Fournisseur supprimé' });
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      return res
        .status(409)
        .json({ message: 'Impossible de supprimer : ce fournisseur a déjà des livraisons' });
    }
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;