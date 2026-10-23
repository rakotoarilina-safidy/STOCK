require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('../src/config/db');

(async () => {
  const [username, motDePasse, nom] = process.argv.slice(2);
  if (!username || !motDePasse || !nom) {
    console.log('Usage : node scripts/creer-responsable.js <username> <motdepasse> "<Nom complet>"');
    process.exit(1);
  }
  try {
    const hash = await bcrypt.hash(motDePasse, 10);
    await pool.query(
      "INSERT INTO UTILISATEURS (username, mot_de_passe, nom, role) VALUES (?, ?, ?, 'RESPONSABLE')",
      [username, hash, nom]
    );
    console.log('Compte responsable créé :', username);
  } catch (err) {
    console.error('Erreur :', err.message);
  } finally {
    await pool.end();
  }
})();