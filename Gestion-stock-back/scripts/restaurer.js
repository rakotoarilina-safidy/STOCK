// Restaure la base à partir d'une sauvegarde.
//
//   node scripts/restaurer.js --derniere
//   node scripts/restaurer.js gestion_stock_2026-10-22_14-30-05.sql.gz
//   node scripts/restaurer.js "E:\sauvegardes\gestion_stock_2026-10-22_14-30-05.sql.gz"
//
// IMPORTANT : arrêtez le serveur (Ctrl+C) avant de lancer ce script.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const readline = require('readline');
const { spawn } = require('child_process');
const { pipeline } = require('stream/promises');
const {
  creerSauvegarde,
  listerSauvegardes,
  trouverOutil,
  dossierSauvegardes,
} = require('../src/services/sauvegarde');

function demander(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) =>
    rl.question(question, (reponse) => {
      rl.close();
      resolve(reponse.trim());
    })
  );
}

(async () => {
  const arg = process.argv[2];
  const liste = listerSauvegardes();

  if (!arg) {
    console.log('Usage : node scripts/restaurer.js <fichier | --derniere>\n');
    console.log(`Sauvegardes disponibles dans ${dossierSauvegardes()} :`);
    if (!liste.length) console.log('  (aucune)');
    liste.slice(0, 15).forEach((s) => console.log(`  ${s.nom}`));
    process.exit(1);
  }

  let fichier;
  if (arg === '--derniere') {
    if (!liste.length) {
      console.error('Aucune sauvegarde trouvée.');
      process.exit(1);
    }
    fichier = path.join(dossierSauvegardes(), liste[0].nom);
  } else {
    fichier = fs.existsSync(arg) ? path.resolve(arg) : path.join(dossierSauvegardes(), arg);
  }
  if (!fs.existsSync(fichier)) {
    console.error(`Fichier introuvable : ${fichier}`);
    process.exit(1);
  }

  console.log(`\nSauvegarde à restaurer : ${fichier}`);
  console.log(`Base concernée         : ${process.env.DB_NAME}`);
  console.log('\nATTENTION : toutes les données actuelles de cette base seront REMPLACÉES');
  console.log('par celles de la sauvegarde (les ventes faites depuis seront perdues).\n');

  if ((await demander('Tapez OUI en majuscules pour continuer : ')) !== 'OUI') {
    console.log('Annulé. Rien n’a été modifié.');
    process.exit(0);
  }

  // Filet de sécurité : on garde une copie de l'état actuel avant d'écraser
  console.log('\nSauvegarde de sécurité de l’état actuel...');
  try {
    const s = await creerSauvegarde('avant-restauration');
    console.log(`Sauvegarde de sécurité créée : ${s.nom}`);
  } catch (err) {
    console.error(`La sauvegarde de sécurité a échoué : ${err.message}`);
    if ((await demander('Continuer quand même ? Tapez OUI : ')) !== 'OUI') {
      console.log('Annulé. Rien n’a été modifié.');
      process.exit(0);
    }
  }

  console.log('\nRestauration en cours...');
  try {
    const args = [
      `--host=${process.env.DB_HOST || 'localhost'}`,
      `--port=${process.env.DB_PORT || 3306}`,
      `--user=${process.env.DB_USER}`,
      '--default-character-set=utf8mb4',
    ];
    const env = { ...process.env };
    if (process.env.DB_PASSWORD) env.MYSQL_PWD = process.env.DB_PASSWORD;

    const enfant = spawn(trouverOutil('mysql', 'MYSQL_PATH'), args, { env, windowsHide: true });
    let erreurs = '';
    enfant.stderr.on('data', (d) => {
      erreurs += d.toString();
    });
    const fin = new Promise((resolve, reject) => {
      enfant.on('error', (e) => reject(new Error(`mysql est introuvable (${e.message})`)));
      enfant.on('close', (code) =>
        code === 0 ? resolve() : reject(new Error(`mysql a échoué (code ${code}) ${erreurs.trim()}`))
      );
    });

    await Promise.all([
      pipeline(fs.createReadStream(fichier), zlib.createGunzip(), enfant.stdin),
      fin,
    ]);
    console.log('\nRestauration terminée avec succès. Vous pouvez relancer le serveur.');
  } catch (err) {
    console.error(`\nÉchec de la restauration : ${err.message}`);
    process.exit(1);
  }
})();