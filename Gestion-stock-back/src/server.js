require('dotenv').config();
const app = require('./app');
const { demarrerPlanification } = require('./services/sauvegarde');
const { adressesLocales } = require('./config/interface');

const PORT = process.env.PORT || 3000;
// 0.0.0.0 : le serveur accepte aussi les connexions des autres PC du réseau local
const HOTE = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOTE, () => {
  console.log(`Serveur démarré sur http://localhost:${PORT}`);

  const adresses = adressesLocales();
  if (adresses.length) {
    console.log('Depuis un autre PC du magasin, ouvrir :');
    adresses.forEach((a) => console.log(`  http://${a}:${PORT}`));
  }

  demarrerPlanification();
});