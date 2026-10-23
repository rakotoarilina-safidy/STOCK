const jwt = require('jsonwebtoken');
const pool = require('../config/db');

async function authentifier(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Non connecté' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const [rows] = await pool.query(
      'SELECT id_utilisateur, username, nom, role, actif FROM UTILISATEURS WHERE id_utilisateur = ?',
      [payload.id]
    );
    if (!rows.length || !rows[0].actif) {
      return res.status(401).json({ message: 'Compte invalide ou désactivé' });
    }
    req.user = {
      id: rows[0].id_utilisateur,
      username: rows[0].username,
      nom: rows[0].nom,
      role: rows[0].role,
    };
    next();
  } catch (err) {
    res.status(401).json({ message: 'Session invalide ou expirée' });
  }
}

function autoriser(...roles) {
  return (req, res, next) =>
    roles.includes(req.user.role)
      ? next()
      : res.status(403).json({ message: 'Accès refusé' });
}

module.exports = { authentifier, autoriser };