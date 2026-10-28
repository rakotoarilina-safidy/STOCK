import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { MAGASIN } from './config-magasin.js';

// ------------------------------------------------------------
// Inventaire du stock en PDF, format A4 portrait :
// tous les produits, de A à Z, avec leur stock et leurs prix.
// ------------------------------------------------------------
const L = 595.28; // largeur A4 en points
const H = 841.89; // hauteur A4 en points
const MARGE = 40;
const MARGE_BAS = 52;
const HAUTEUR_LIGNE = 19;

const COULEURS = {
  vert: rgb(0.059, 0.463, 0.431),
  encre: rgb(0.08, 0.14, 0.12),
  gris: rgb(0.36, 0.42, 0.4),
  ligne: rgb(0.85, 0.89, 0.88),
  fondAlerte: rgb(0.99, 0.92, 0.91),
  fondResume: rgb(0.95, 0.97, 0.96),
  rouge: rgb(0.76, 0.2, 0.17),
  blanc: rgb(1, 1, 1),
};

// Les polices standard du PDF n'acceptent que le latin : on remplace le reste
const propre = (valeur) =>
  String(valeur ?? '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\s+/g, ' ')
    .replace(/[^\x20-\x7E\u00A1-\u00FF]/g, '?');

const nombre = (n) => propre(new Intl.NumberFormat('fr-FR').format(Math.round(Number(n) || 0)));

function statutDe(a) {
  if (a.statut) return a.statut;
  if (a.quantite_stock <= 0) return 'RUPTURE';
  return a.quantite_stock <= a.seuil_alerte ? 'BAS' : 'OK';
}

const LIBELLE_STATUT = { RUPTURE: 'Rupture', BAS: 'Stock bas', OK: '' };

function tronquer(texte, police, taille, largeurMax) {
  if (police.widthOfTextAtSize(texte, taille) <= largeurMax) return texte;
  let t = texte;
  while (t.length > 1 && police.widthOfTextAtSize(`${t}...`, taille) > largeurMax) {
    t = t.slice(0, -1);
  }
  return `${t.trimEnd()}...`;
}

/**
 * articles : [{ designation, quantite_stock, seuil_alerte, prix_achat,
 *               prix_vente_detail, prix_vente_gros, statut? }]
 * Renvoie les octets du PDF.
 */
export async function genererInventairePdf({ articles, utilisateur = '', colonneCompte = false }) {
  const doc = await PDFDocument.create();
  doc.setTitle(propre(`Inventaire du stock - ${MAGASIN.nom}`));
  doc.setAuthor(propre(MAGASIN.nom));
  doc.setCreator(propre(MAGASIN.nom));

  const police = await doc.embedFont(StandardFonts.Helvetica);
  const gras = await doc.embedFont(StandardFonts.HelveticaBold);
  const largeurUtile = L - 2 * MARGE;

  const maintenant = new Date();
  const dateLongue = maintenant.toLocaleDateString('fr-FR');
  const heure = maintenant.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  let page = null;
  let y = 0;

  // ---------- outils de dessin ----------
  function ecrire(texte, x, yy, { taille = 9, f = police, couleur = COULEURS.encre, align = 'left', largeur } = {}) {
    let t = propre(texte);
    if (largeur) t = tronquer(t, f, taille, largeur);
    const w = f.widthOfTextAtSize(t, taille);
    const px = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
    page.drawText(t, { x: px, y: yy, size: taille, font: f, color: couleur });
  }

  function trait(yy, couleur = COULEURS.ligne, epaisseur = 0.7) {
    page.drawLine({
      start: { x: MARGE, y: yy },
      end: { x: L - MARGE, y: yy },
      thickness: epaisseur,
      color: couleur,
    });
  }

  function nouvellePage(suite) {
    page = doc.addPage([L, H]);
    y = H - MARGE;
    if (suite) {
      ecrire(MAGASIN.nom, MARGE, y - 10, { taille: 10, f: gras, couleur: COULEURS.vert });
      ecrire('Inventaire du stock - suite', L - MARGE, y - 10, {
        taille: 9,
        couleur: COULEURS.gris,
        align: 'right',
      });
      y -= 18;
      trait(y);
      y -= 18;
    }
  }

  // ---------- en-tête ----------
  nouvellePage(false);
  ecrire(MAGASIN.nom, MARGE, y - 18, { taille: 20, f: gras, couleur: COULEURS.vert });
  ecrire(`Édité le ${dateLongue} à ${heure}`, L - MARGE, y - 10, {
    taille: 9,
    couleur: COULEURS.gris,
    align: 'right',
  });
  if (utilisateur) {
    ecrire(`par ${utilisateur}`, L - MARGE, y - 22, { taille: 9, couleur: COULEURS.gris, align: 'right' });
  }
  y -= 36;
  ecrire('Inventaire du stock', MARGE, y - 4, { taille: 14, f: gras });
  ecrire('Prix par unité, en Ar', L - MARGE, y - 4, { taille: 9, couleur: COULEURS.gris, align: 'right' });
  y -= 14;
  y -= 8;
  trait(y, COULEURS.vert, 1.2);
  y -= 16;

  // ---------- résumé : nombre de produits et nombre à réapprovisionner ----------
  const liste = [...articles]
    .sort((a, b) => a.designation.localeCompare(b.designation, 'fr'))
    .map((a) => ({ ...a, _statut: statutDe(a) }));
  const nbAReappro = liste.filter((a) => a._statut !== 'OK').length;

  const boites = [
    ['Produits', nombre(liste.length)],
    ['À réapprovisionner', nombre(nbAReappro)],
  ];
  const largeurBoite = 150;
  boites.forEach(([libelle, valeur], i) => {
    const bx = MARGE + i * (largeurBoite + 10);
    page.drawRectangle({ x: bx, y: y - 40, width: largeurBoite, height: 40, color: COULEURS.fondResume });
    ecrire(libelle, bx + 10, y - 14, { taille: 8.5, couleur: COULEURS.gris });
    ecrire(valeur, bx + 10, y - 31, {
      taille: 14,
      f: gras,
      couleur: i === 1 && nbAReappro ? COULEURS.rouge : COULEURS.encre,
    });
  });
  y -= 62;

  // ---------- tableau ----------
  const colonnes = [
    { titre: 'Produit', largeur: null },
    { titre: 'Stock', largeur: 46, align: 'right', gras: true },
    { titre: 'Prix d\'achat', largeur: 80, align: 'right' },
    { titre: 'Vente détail', largeur: 80, align: 'right' },
    { titre: 'Vente gros', largeur: 80, align: 'right' },
    { titre: 'État', largeur: 60, statut: true },
  ];
  if (colonneCompte) colonnes.push({ titre: 'Compté', largeur: 56, compte: true });

  const fixe = colonnes.reduce((s, c) => s + (c.largeur || 0), 0);
  const cols = colonnes.map((c) => ({ ...c, largeur: c.largeur || largeurUtile - fixe }));
  const positions = [];
  let px = MARGE;
  cols.forEach((c) => {
    positions.push(px);
    px += c.largeur;
  });

  function entete() {
    page.drawRectangle({ x: MARGE, y: y - HAUTEUR_LIGNE, width: largeurUtile, height: HAUTEUR_LIGNE, color: COULEURS.vert });
    cols.forEach((c, i) => {
      const x = c.align === 'right' ? positions[i] + c.largeur - 6 : positions[i] + 6;
      ecrire(c.titre, x, y - 13, {
        taille: 8.5,
        f: gras,
        couleur: COULEURS.blanc,
        align: c.align,
        largeur: c.largeur - 10,
      });
    });
    y -= HAUTEUR_LIGNE;
  }

  function ligneTableau(cellules, alerte) {
    if (y - HAUTEUR_LIGNE < MARGE_BAS) {
      nouvellePage(true);
      entete();
    }
    if (alerte) {
      page.drawRectangle({ x: MARGE, y: y - HAUTEUR_LIGNE, width: largeurUtile, height: HAUTEUR_LIGNE, color: COULEURS.fondAlerte });
    }
    cols.forEach((c, i) => {
      if (c.compte) {
        // case vide à remplir à la main pendant le comptage
        page.drawRectangle({
          x: positions[i] + 6,
          y: y - HAUTEUR_LIGNE + 4,
          width: c.largeur - 12,
          height: HAUTEUR_LIGNE - 8,
          borderColor: COULEURS.gris,
          borderWidth: 0.6,
        });
        return;
      }
      const valeur = cellules[i];
      const x = c.align === 'right' ? positions[i] + c.largeur - 6 : positions[i] + 6;
      const enAlerte = c.statut && valeur;
      ecrire(valeur, x, y - 13, {
        taille: 9,
        f: enAlerte || c.gras ? gras : police,
        couleur: enAlerte ? COULEURS.rouge : COULEURS.encre,
        align: c.align,
        largeur: c.largeur - 10,
      });
    });
    trait(y - HAUTEUR_LIGNE);
    y -= HAUTEUR_LIGNE;
  }

  entete();
  liste.forEach((a) => {
    ligneTableau(
      [
        a.designation,
        nombre(a.quantite_stock),
        nombre(a.prix_achat),
        nombre(a.prix_vente_detail),
        nombre(a.prix_vente_gros),
        LIBELLE_STATUT[a._statut],
        '',
      ],
      a._statut !== 'OK'
    );
  });

  // ---------- pieds de page ----------
  const total = doc.getPageCount();
  doc.getPages().forEach((p, i) => {
    page = p;
    trait(MARGE_BAS - 14);
    ecrire(`${MAGASIN.nom} - Inventaire du ${dateLongue}`, MARGE, MARGE_BAS - 28, {
      taille: 8,
      couleur: COULEURS.gris,
    });
    ecrire(`Page ${i + 1} / ${total}`, L - MARGE, MARGE_BAS - 28, {
      taille: 8,
      couleur: COULEURS.gris,
      align: 'right',
    });
  });

  return doc.save();
}

export function telechargerPdf(octets, nomFichier) {
  const url = URL.createObjectURL(new Blob([octets], { type: 'application/pdf' }));
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = nomFichier;
  lien.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
