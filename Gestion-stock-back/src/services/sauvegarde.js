const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { spawn } = require('child_process');
const { pipeline } = require('stream/promises');

// gestion_stock_2026-10-22_14-30-05.sql.gz
const MOTIF_NOM = /^gestion_stock_(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})\.sql\.gz$/;

let enCours = false;
let dernierResultat = null;

// Les variables d'environnement sont lues au moment de l'utilisation (dotenv déjà chargé)
const dossierSauvegardes = () =>
  path.resolve(process.env.BACKUP_DIR || path.join(__dirname, '..', '..', 'sauvegardes'));

const dossierCopie = () =>
  process.env.BACKUP_COPIE_DIR ? path.resolve(process.env.BACKUP_COPIE_DIR) : null;

const intervalleHeures = () =>
  Number(process.env.BACKUP_INTERVALLE_HEURES) > 0 ? Number(process.env.BACKUP_INTERVALLE_HEURES) : 6;

// Cherche mysqldump / mysql : variable du .env, sinon XAMPP, sinon le PATH
function trouverOutil(nom, variable) {
  const exe = process.platform === 'win32' ? `${nom}.exe` : nom;
  const candidats = [process.env[variable], path.join('C:\\xampp\\mysql\\bin', exe)].filter(Boolean);
  for (const c of candidats) {
    if (fs.existsSync(c)) return c;
  }
  return nom;
}

function horodatage(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(
    d.getMinutes()
  )}-${p(d.getSeconds())}`;
}

function dateDepuisNom(nom) {
  const m = nom.match(MOTIF_NOM);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
}

function listerDossier(dossier) {
  try {
    if (!fs.existsSync(dossier)) return [];
    return fs
      .readdirSync(dossier)
      .filter((nom) => MOTIF_NOM.test(nom))
      .map((nom) => ({
        nom,
        date: dateDepuisNom(nom),
        taille: fs.statSync(path.join(dossier, nom)).size,
      }))
      .sort((a, b) => b.date - a.date);
  } catch {
    return [];
  }
}

const listerSauvegardes = () => listerDossier(dossierSauvegardes());

// Rotation : tout est gardé 7 jours ; ensuite une seule sauvegarde par jour jusqu'à 90 jours ;
// au-delà, suppression.
function nettoyer(dossier) {
  const JOUR = 24 * 60 * 60 * 1000;
  const maintenant = Date.now();
  const joursGardes = new Set();

  for (const f of listerDossier(dossier)) {
    // du plus récent au plus ancien
    const age = (maintenant - f.date.getTime()) / JOUR;
    let supprimer = false;
    if (age > 90) {
      supprimer = true;
    } else if (age > 7) {
      const jour = f.nom.slice(14, 24);
      if (joursGardes.has(jour)) supprimer = true;
      else joursGardes.add(jour);
    }
    if (supprimer) {
      try {
        fs.unlinkSync(path.join(dossier, f.nom));
      } catch {
        /* ignoré */
      }
    }
  }
}

// Crée une sauvegarde compressée de la base. Renvoie { nom, taille, copie }.
// copie : null (pas de copie externe configurée), 'ok', ou 'échec : ...'
async function creerSauvegarde(raison = 'manuelle') {
  if (enCours) throw new Error('Une sauvegarde est déjà en cours');
  enCours = true;

  const dossier = dossierSauvegardes();
  const nom = `gestion_stock_${horodatage()}.sql.gz`;
  const finale = path.join(dossier, nom);
  const partielle = `${finale}.partial`;

  try {
    fs.mkdirSync(dossier, { recursive: true });

    const args = [
      `--host=${process.env.DB_HOST || 'localhost'}`,
      `--port=${process.env.DB_PORT || 3306}`,
      `--user=${process.env.DB_USER}`,
      '--single-transaction',
      '--routines',
      '--triggers',
      '--default-character-set=utf8mb4',
      '--databases',
      process.env.DB_NAME,
    ];
    const env = { ...process.env };
    if (process.env.DB_PASSWORD) env.MYSQL_PWD = process.env.DB_PASSWORD;

    const enfant = spawn(trouverOutil('mysqldump', 'MYSQLDUMP_PATH'), args, {
      env,
      windowsHide: true,
    });

    let erreurs = '';
    enfant.stderr.on('data', (d) => {
      erreurs += d.toString();
    });
    const fin = new Promise((resolve, reject) => {
      enfant.on('error', (e) =>
        reject(new Error(`mysqldump est introuvable ou ne peut pas démarrer (${e.message})`))
      );
      enfant.on('close', (code) =>
        code === 0
          ? resolve()
          : reject(new Error(`mysqldump a échoué (code ${code}) ${erreurs.trim()}`))
      );
    });

    await Promise.all([
      pipeline(enfant.stdout, zlib.createGzip(), fs.createWriteStream(partielle)),
      fin,
    ]);

    const taille = fs.statSync(partielle).size;
    if (taille < 200) throw new Error('La sauvegarde obtenue est vide');
    fs.renameSync(partielle, finale); // le fichier n'apparaît qu'une fois complet
    nettoyer(dossier);

    // Copie sur un second emplacement (clé USB, disque externe...)
    let copie = null;
    const cible = dossierCopie();
    if (cible) {
      try {
        fs.mkdirSync(cible, { recursive: true });
        fs.copyFileSync(finale, path.join(cible, nom));
        nettoyer(cible);
        copie = 'ok';
      } catch (e) {
        copie = `échec : ${e.message}`;
      }
    }

    dernierResultat = { ok: true, date: new Date(), nom, taille, copie, raison };
    console.log(`Sauvegarde créée : ${nom} (${raison})${copie ? ` — copie : ${copie}` : ''}`);
    return { nom, taille, copie };
  } catch (err) {
    try {
      fs.unlinkSync(partielle);
    } catch {
      /* rien à supprimer */
    }
    dernierResultat = { ok: false, date: new Date(), message: err.message, raison };
    console.error(`Sauvegarde échouée : ${err.message}`);
    throw err;
  } finally {
    enCours = false;
  }
}

function etat() {
  return {
    en_cours: enCours,
    dossier: dossierSauvegardes(),
    dossier_copie: dossierCopie(),
    intervalle_heures: intervalleHeures(),
    derniere: dernierResultat,
  };
}

// Sauvegarde 30 secondes après le démarrage si la dernière date de plus de 2 h,
// puis automatiquement toutes les N heures (6 par défaut) tant que le serveur tourne.
function demarrerPlanification() {
  const HEURE = 60 * 60 * 1000;

  const siNecessaire = (raison, delaiMinimum) => async () => {
    const liste = listerSauvegardes();
    if (liste.length && Date.now() - liste[0].date.getTime() < delaiMinimum) return;
    try {
      await creerSauvegarde(raison);
    } catch {
      /* déjà journalisé */
    }
  };

  setTimeout(siNecessaire('démarrage', 2 * HEURE), 30 * 1000);
  setInterval(siNecessaire('planifiée', 2 * HEURE), intervalleHeures() * HEURE);
  console.log(`Sauvegarde automatique activée (toutes les ${intervalleHeures()} h) → ${dossierSauvegardes()}`);
}

module.exports = {
  creerSauvegarde,
  listerSauvegardes,
  demarrerPlanification,
  etat,
  trouverOutil,
  dossierSauvegardes,
  MOTIF_NOM,
};