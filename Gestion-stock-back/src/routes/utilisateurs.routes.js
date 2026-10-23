const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { authentifier, autoriser } = require('../middleware/auth');

const router = express.Router();
router.use(authentifier);

// ------------------------------------------------------------
// Pour tout utilisateur connecté : son propre compte
// ------------------------------------------------------------
router.put('/moi', async (req, res) => {
  const { nom } = req.body;
  if (!nom || !nom.trim()) {
    return res.status(400).json({ message: 'Le nom est requis' });
  }
  try {
    await pool.query('UPDATE UTILISATEURS SET nom = ? WHERE id_utilisateur = ?', [
      nom.trim(),
      req.user.id,
    ]);
    res.json({ message: 'Informations mises à jour' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

router.patch('/moi/mot-de-passe', async (req, res) => {
  const { ancien, nouveau } = req.body;
  if (!ancien || !nouveau || nouveau.length < 6) {
    return res
      .status(400)
      .json({ message: 'Ancien mot de passe requis, nouveau : 6 caractères minimum' });
  }
  try {
    const [rows] = await pool.query(
      'SELECT mot_de_passe FROM UTILISATEURS WHERE id_utilisateur = ?',
      [req.user.id]
    );
    if (!rows.length || !(await bcrypt.compare(ancien, rows[0].mot_de_passe))) {
      return res.status(400).json({ message: 'Ancien mot de passe incorrect' });
    }
    const hash = await bcrypt.hash(nouveau, 10);
    await pool.query('UPDATE UTILISATEURS SET mot_de_passe = ? WHERE id_utilisateur = ?', [
      hash,
      req.user.id,
    ]);
    res.json({ message: 'Mot de passe modifié' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// ------------------------------------------------------------
// Réservé à la responsable : gestion de tous les comptes
// ------------------------------------------------------------
router.use(autoriser('RESPONSABLE'));

// Vérifie qu'il restera au moins une responsable active si on modifie ce compte
async function ilResteUneResponsable(saufId) {
  const [[r]] = await pool.query(
    "SELECT COUNT(*) AS n FROM UTILISATEURS WHERE role = 'RESPONSABLE' AND actif = 1 AND id_utilisateur <> ?",
    [saufId]
  );
  return Number(r.n) > 0;
}

router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id_utilisateur, username, nom, role, actif, date_creation FROM UTILISATEURS ORDER BY nom'
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

router.post('/', async (req, res) => {
  const { username, mot_de_passe, nom, role } = req.body;
  if (!username || !mot_de_passe || !nom) {
    return res.status(400).json({ message: 'username, mot_de_passe et nom sont requis' });
  }
  if (mot_de_passe.length < 6) {
    return res.status(400).json({ message: 'Mot de passe : 6 caractères minimum' });
  }
  const roleFinal = role === 'RESPONSABLE' ? 'RESPONSABLE' : 'CAISSIER';
  try {
    const hash = await bcrypt.hash(mot_de_passe, 10);
    const [r] = await pool.query(
      'INSERT INTO UTILISATEURS (username, mot_de_passe, nom, role) VALUES (?, ?, ?, ?)',
      [username.trim(), hash, nom.trim(), roleFinal]
    );
    res.status(201).json({ id_utilisateur: r.insertId, username, nom, role: roleFinal });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Cet identifiant existe déjà' });
    }
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Modifier l'identifiant, le nom et le rôle d'un compte
router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { username, nom, role } = req.body;
  if (!username || !username.trim() || !nom || !nom.trim()) {
    return res.status(400).json({ message: "L'identifiant et le nom sont requis" });
  }
  const roleFinal = role === 'RESPONSABLE' ? 'RESPONSABLE' : 'CAISSIER';
  try {
    if (roleFinal === 'CAISSIER' && !(await ilResteUneResponsable(id))) {
      return res
        .status(400)
        .json({ message: 'Il doit rester au moins une responsable active' });
    }
    const [r] = await pool.query(
      'UPDATE UTILISATEURS SET username = ?, nom = ?, role = ? WHERE id_utilisateur = ?',
      [username.trim(), nom.trim(), roleFinal, id]
    );
    if (!r.affectedRows) return res.status(404).json({ message: 'Compte introuvable' });
    res.json({ message: 'Compte modifié' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Cet identifiant existe déjà' });
    }
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

router.patch('/:id/actif', async (req, res) => {
  const id = Number(req.params.id);
  const actif = req.body.actif ? 1 : 0;
  if (id === req.user.id && !actif) {
    return res.status(400).json({ message: 'Vous ne pouvez pas désactiver votre propre compte' });
  }
  try {
    if (!actif && !(await ilResteUneResponsable(id))) {
      return res
        .status(400)
        .json({ message: 'Il doit rester au moins une responsable active' });
    }
    await pool.query('UPDATE UTILISATEURS SET actif = ? WHERE id_utilisateur = ?', [actif, id]);
    res.json({ message: 'Compte mis à jour' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Réinitialiser le mot de passe d'un autre compte
router.patch('/:id/mot-de-passe', async (req, res) => {
  const { mot_de_passe } = req.body;
  if (!mot_de_passe || mot_de_passe.length < 6) {
    return res.status(400).json({ message: 'Mot de passe : 6 caractères minimum' });
  }
  try {
    const hash = await bcrypt.hash(mot_de_passe, 10);
    await pool.query('UPDATE UTILISATEURS SET mot_de_passe = ? WHERE id_utilisateur = ?', [
      hash,
      req.params.id,
    ]);
    res.json({ message: 'Mot de passe modifié' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;