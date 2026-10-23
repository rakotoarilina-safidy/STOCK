
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { authentifier } = require('../middleware/auth');

const router = express.Router();

router.post('/login', async (req, res) => {
  const { username, mot_de_passe } = req.body;
  if (!username || !mot_de_passe) {
    return res.status(400).json({ message: 'Identifiant et mot de passe requis' });
  }
  try {
    const [rows] = await pool.query('SELECT * FROM UTILISATEURS WHERE username = ?', [username]);
    const u = rows[0];
    if (!u || !u.actif || !(await bcrypt.compare(mot_de_passe, u.mot_de_passe))) {
      return res.status(401).json({ message: 'Identifiant ou mot de passe incorrect' });
    }
    const token = jwt.sign({ id: u.id_utilisateur, role: u.role }, process.env.JWT_SECRET, {
      expiresIn: '8h',
    });
    res.json({
      token,
      user: { id: u.id_utilisateur, username: u.username, nom: u.nom, role: u.role },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

router.get('/me', authentifier, (req, res) => res.json({ user: req.user }));

module.exports = router;