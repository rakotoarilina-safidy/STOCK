const express = require('express');
const os = require('os');
const { authentifier, autoriser } = require('../middleware/auth');
const { adressesLocales, disponible } = require('../config/interface');

const router = express.Router();
router.use(authentifier, autoriser('RESPONSABLE'));

// Informations pour connecter un deuxième PC
router.get('/', (req, res) => {
  res.json({
    port: Number(process.env.PORT) || 3000,
    adresses: adressesLocales(),
    nom_pc: os.hostname(),
    interface_servie: disponible(),
  });
});

module.exports = router;