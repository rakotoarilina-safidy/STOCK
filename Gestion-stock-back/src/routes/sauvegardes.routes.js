const express = require('express');
const path = require('path');
const fs = require('fs');
const { authentifier, autoriser } = require('../middleware/auth');
const {
  creerSauvegarde,
  listerSauvegardes,
  etat,
  dossierSauvegardes,
  MOTIF_NOM,
} = require('../services/sauvegarde');

const router = express.Router();
// Les sauvegardes contiennent toutes les données (y compris les prix d'achat) :
// réservées à la responsable.
router.use(authentifier, autoriser('RESPONSABLE'));

// État + liste des sauvegardes
router.get('/', (req, res) => {
  res.json({ etat: etat(), sauvegardes: listerSauvegardes() });
});

// Sauvegarder maintenant
router.post('/', async (req, res) => {
  try {
    const r = await creerSauvegarde('manuelle');
    res.status(201).json(r);
  } catch (err) {
    res.status(500).json({ message: `Échec de la sauvegarde : ${err.message}` });
  }
});

// Télécharger une sauvegarde (pour la mettre sur une clé USB, par exemple)
router.get('/:nom/telecharger', (req, res) => {
  const nom = path.basename(req.params.nom);
  if (!MOTIF_NOM.test(nom)) return res.status(400).json({ message: 'Nom de fichier invalide' });
  const chemin = path.join(dossierSauvegardes(), nom);
  if (!fs.existsSync(chemin)) return res.status(404).json({ message: 'Sauvegarde introuvable' });
  res.download(chemin, nom);
});

module.exports = router;