const fs = require('fs');
const os = require('os');
const path = require('path');

// Dossier de l'interface construite (résultat de « npm run build » dans le front).
// Modifiable avec FRONT_DIR dans le fichier .env.
const dossier = () =>
  path.resolve(
    process.env.FRONT_DIR || path.join(__dirname, '..', '..', '..', 'gestion-stock-front', 'dist')
  );

const disponible = () => fs.existsSync(path.join(dossier(), 'index.html'));

// Adresses IPv4 de ce PC sur le réseau local (ex. 192.168.1.50)
function adressesLocales() {
  const adresses = [];
  for (const interfaces of Object.values(os.networkInterfaces())) {
    for (const i of interfaces || []) {
      const ipv4 = i.family === 'IPv4' || i.family === 4;
      if (ipv4 && !i.internal && !i.address.startsWith('169.254.')) adresses.push(i.address);
    }
  }
  return adresses;
}

module.exports = { dossier, disponible, adressesLocales };