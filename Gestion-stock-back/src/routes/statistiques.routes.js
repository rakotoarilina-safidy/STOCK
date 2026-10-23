const express = require('express');
const pool = require('../config/db');
const { authentifier } = require('../middleware/auth');
const { bornes, arrondi, fmt } = require('../utils/periode');

const router = express.Router();
router.use(authentifier);

const FILTRE_DATES = 'v.date_vente >= ? AND v.date_vente < DATE_ADD(?, INTERVAL 1 DAY)';

const voirBenefices = (req) => req.user.role === 'RESPONSABLE';

// Le caissier ne reçoit jamais le bénéfice, ni le coût des marchandises vendues
// (car chiffre d'affaires - coût = bénéfice)
function filtrer(obj, voir) {
  if (voir) return obj;
  const copie = { ...obj };
  delete copie.benefice;
  delete copie.cout_marchandises;
  return copie;
}

// Chiffre d'affaires, bénéfice, etc. sur une période
async function resume(du, au) {
  const [[v]] = await pool.query(
    `SELECT COUNT(DISTINCT v.id_vente) AS nb_ventes,
            COALESCE(SUM(d.quantite_vendue), 0) AS quantite_vendue,
            COALESCE(SUM(d.quantite_vendue * d.prix_unitaire_applique), 0) AS chiffre_affaires,
            COALESCE(SUM(d.quantite_vendue * d.prix_achat_unitaire), 0) AS cout_marchandises
     FROM VENTES v
     JOIN DETAILS_VENTES d ON d.id_vente = v.id_vente
     WHERE ${FILTRE_DATES}`,
    [du, au]
  );
  const [[a]] = await pool.query(
    `SELECT COALESCE(SUM(montant_total), 0) AS total_achats
     FROM V_ACHATS_TOTAUX
     WHERE date_approvisionnement >= ? AND date_approvisionnement <= ?`,
    [du, au]
  );
  const ca = arrondi(v.chiffre_affaires);
  const cout = arrondi(v.cout_marchandises);
  return {
    du,
    au,
    nb_ventes: Number(v.nb_ventes),
    quantite_vendue: Number(v.quantite_vendue),
    chiffre_affaires: ca,
    cout_marchandises: cout,
    benefice: arrondi(ca - cout),
    total_achats: arrondi(a.total_achats),
  };
}

// Évolution des ventes regroupées par jour, semaine, mois ou année
const GROUPES = {
  jour: { expr: "DATE_FORMAT(v.date_vente, '%Y-%m-%d')", jours: 30 },
  semaine: { expr: "DATE_FORMAT(v.date_vente, '%x-S%v')", jours: 84 },
  mois: { expr: "DATE_FORMAT(v.date_vente, '%Y-%m')", jours: 365 },
  annee: { expr: "DATE_FORMAT(v.date_vente, '%Y')", jours: 1825 },
};

// Ajoute les jours sans vente (à zéro) pour que les histogrammes n'aient pas de trous
function completerJours(donnees, du, au) {
  const parJour = new Map(donnees.map((d) => [d.periode, d]));
  const resultat = [];
  const fin = new Date(`${au}T00:00:00`);
  for (let d = new Date(`${du}T00:00:00`); d <= fin; d.setDate(d.getDate() + 1)) {
    const cle = fmt(d);
    resultat.push(
      parJour.get(cle) || { periode: cle, nb_ventes: 0, chiffre_affaires: 0, benefice: 0 }
    );
  }
  return resultat;
}

async function evolution(groupe, du, au) {
  const [rows] = await pool.query(
    `SELECT ${GROUPES[groupe].expr} AS periode,
            COUNT(DISTINCT v.id_vente) AS nb_ventes,
            SUM(d.quantite_vendue * d.prix_unitaire_applique) AS chiffre_affaires,
            SUM(d.quantite_vendue * (d.prix_unitaire_applique - d.prix_achat_unitaire)) AS benefice
     FROM VENTES v
     JOIN DETAILS_VENTES d ON d.id_vente = v.id_vente
     WHERE ${FILTRE_DATES}
     GROUP BY periode
     ORDER BY periode`,
    [du, au]
  );
  const donnees = rows.map((r) => ({
    periode: r.periode,
    nb_ventes: Number(r.nb_ventes),
    chiffre_affaires: arrondi(r.chiffre_affaires),
    benefice: arrondi(r.benefice),
  }));
  return groupe === 'jour' ? completerJours(donnees, du, au) : donnees;
}

// Articles les plus vendus
async function topArticles(du, au, limite) {
  const [rows] = await pool.query(
    `SELECT a.id_article, a.designation,
            SUM(d.quantite_vendue) AS quantite_vendue,
            SUM(d.quantite_vendue * d.prix_unitaire_applique) AS chiffre_affaires,
            SUM(d.quantite_vendue * (d.prix_unitaire_applique - d.prix_achat_unitaire)) AS benefice
     FROM DETAILS_VENTES d
     JOIN VENTES v ON v.id_vente = d.id_vente
     JOIN ARTICLES a ON a.id_article = d.id_article
     WHERE ${FILTRE_DATES}
     GROUP BY a.id_article, a.designation
     ORDER BY quantite_vendue DESC
     LIMIT ?`,
    [du, au, limite]
  );
  return rows.map((r) => ({
    id_article: r.id_article,
    designation: r.designation,
    quantite_vendue: Number(r.quantite_vendue),
    chiffre_affaires: arrondi(r.chiffre_affaires),
    benefice: arrondi(r.benefice),
  }));
}

// GET /api/statistiques/resume?periode=mois   (ou ?du=...&au=...)
router.get('/resume', async (req, res) => {
  try {
    const { du, au } = bornes(req.query);
    res.json(filtrer(await resume(du, au), voirBenefices(req)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// GET /api/statistiques/evolution?groupe=jour|semaine|mois|annee
//     &jours=10   (derniers N jours)   ou   &du=...&au=...
router.get('/evolution', async (req, res) => {
  try {
    const groupe = GROUPES[req.query.groupe] ? req.query.groupe : 'jour';
    const voir = voirBenefices(req);

    const aujourdhui = fmt(new Date());
    let du = req.query.du;
    const au = req.query.au || aujourdhui;
    if (!du) {
      const nb = parseInt(req.query.jours, 10);
      const debut = new Date();
      debut.setDate(
        debut.getDate() - (nb > 0 ? Math.min(nb, 3650) - 1 : GROUPES[groupe].jours)
      );
      du = fmt(debut);
    }

    const donnees = await evolution(groupe, du, au);
    res.json({ groupe, du, au, donnees: donnees.map((d) => filtrer(d, voir)) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// GET /api/statistiques/top-articles?periode=mois&limite=10
router.get('/top-articles', async (req, res) => {
  try {
    const { du, au } = bornes(req.query);
    const limite = Math.min(Math.max(parseInt(req.query.limite, 10) || 10, 1), 100);
    const articles = await topArticles(du, au, limite);
    res.json({ du, au, articles: articles.map((a) => filtrer(a, voirBenefices(req))) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Page d'accueil : tout sur une seule requête
router.get('/tableau-de-bord', async (req, res) => {
  try {
    const voir = voirBenefices(req);
    const jour = bornes({ periode: 'jour' });
    const semaine = bornes({ periode: 'semaine' });
    const mois = bornes({ periode: 'mois' });
    const annee = bornes({ periode: 'annee' });

    const debut10 = new Date();
    debut10.setDate(debut10.getDate() - 9);

    const [aujourdhui, cetteSemaine, ceMois, cetteAnnee, derniersJours, top, valeur, stockBas] =
      await Promise.all([
        resume(jour.du, jour.au),
        resume(semaine.du, semaine.au),
        resume(mois.du, mois.au),
        resume(annee.du, annee.au),
        evolution('jour', fmt(debut10), jour.au),
        topArticles(mois.du, mois.au, 5),
        pool.query(
          `SELECT COUNT(*) AS nb_articles,
                  COALESCE(SUM(quantite_stock * prix_achat), 0) AS valeur_achat,
                  COALESCE(SUM(quantite_stock * prix_vente_detail), 0) AS valeur_vente_detail
           FROM ARTICLES`
        ),
        pool.query(
          `SELECT id_article, designation, quantite_stock, seuil_alerte
           FROM ARTICLES
           WHERE quantite_stock <= seuil_alerte
           ORDER BY quantite_stock
           LIMIT 20`
        ),
      ]);

    const v = valeur[0][0];
    res.json({
      aujourdhui: filtrer(aujourdhui, voir),
      cette_semaine: filtrer(cetteSemaine, voir),
      ce_mois: filtrer(ceMois, voir),
      cette_annee: filtrer(cetteAnnee, voir),
      derniers_jours: derniersJours.map((d) => filtrer(d, voir)),
      top_articles_du_mois: top.map((a) => filtrer(a, voir)),
      stock: {
        nb_articles: Number(v.nb_articles),
        valeur_achat: arrondi(v.valeur_achat),
        valeur_vente_detail: arrondi(v.valeur_vente_detail),
      },
      stock_bas: stockBas[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;    