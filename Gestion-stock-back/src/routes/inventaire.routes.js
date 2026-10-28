const express = require('express');
const pool = require('../config/db');
const { authentifier, autoriser } = require('../middleware/auth');
const { bornes } = require('../utils/periode');

const router = express.Router();
// L'inventaire se fait uniquement côté responsable
router.use(authentifier, autoriser('RESPONSABLE'));

// Inventaire du stock : tous les produits par ordre alphabétique, avec leur stock et leurs prix
router.get('/stock', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id_article, designation, quantite_stock, seuil_alerte,
              prix_achat, prix_vente_detail, prix_vente_gros
       FROM ARTICLES
       ORDER BY designation`
    );

    const articles = rows.map((r) => ({
      ...r,
      statut: r.quantite_stock <= 0 ? 'RUPTURE' : r.quantite_stock <= r.seuil_alerte ? 'BAS' : 'OK',
    }));

    res.json({
      totaux: {
        nb_articles: articles.length,
        nb_a_reapprovisionner: articles.filter((a) => a.statut !== 'OK').length,
      },
      articles,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Mouvements sur une période : stock au début, entrées, sorties, stock à la fin
// GET /api/inventaire/mouvements?periode=semaine   (jour | semaine | mois | annee)
// GET /api/inventaire/mouvements?du=2026-10-01&au=2026-10-31
router.get('/mouvements', async (req, res) => {
  try {
    const { du, au } = bornes(req.query);

    const [rows] = await pool.query(
      `SELECT a.id_article, a.designation, a.quantite_stock,
        COALESCE((SELECT SUM(d.quantite_achetee)
                  FROM DETAILS_ACHATS d JOIN ACHATS ac ON ac.id_achat = d.id_achat
                  WHERE d.id_article = a.id_article
                    AND ac.date_approvisionnement >= ?), 0) AS achats_depuis_debut,
        COALESCE((SELECT SUM(d.quantite_vendue)
                  FROM DETAILS_VENTES d JOIN VENTES v ON v.id_vente = d.id_vente
                  WHERE d.id_article = a.id_article
                    AND v.date_vente >= ?), 0) AS ventes_depuis_debut,
        COALESCE((SELECT SUM(d.quantite_achetee)
                  FROM DETAILS_ACHATS d JOIN ACHATS ac ON ac.id_achat = d.id_achat
                  WHERE d.id_article = a.id_article
                    AND ac.date_approvisionnement >= ?
                    AND ac.date_approvisionnement <= ?), 0) AS entrees,
        COALESCE((SELECT SUM(d.quantite_vendue)
                  FROM DETAILS_VENTES d JOIN VENTES v ON v.id_vente = d.id_vente
                  WHERE d.id_article = a.id_article
                    AND v.date_vente >= ?
                    AND v.date_vente < DATE_ADD(?, INTERVAL 1 DAY)), 0) AS sorties,
        COALESCE((SELECT SUM(s.quantite_apres - s.quantite_avant)
                  FROM AJUSTEMENTS_STOCK s
                  WHERE s.id_article = a.id_article
                    AND s.date_ajustement >= ?), 0) AS ajust_depuis_debut,
        COALESCE((SELECT SUM(s.quantite_apres - s.quantite_avant)
                  FROM AJUSTEMENTS_STOCK s
                  WHERE s.id_article = a.id_article
                    AND s.date_ajustement >= ?
                    AND s.date_ajustement < DATE_ADD(?, INTERVAL 1 DAY)), 0) AS ajustements
       FROM ARTICLES a
       ORDER BY a.designation`,
      [du, du, du, au, du, au, du, du, au]
    );

    const articles = rows.map((r) => {
      const stockActuel = Number(r.quantite_stock);
      const entrees = Number(r.entrees);
      const sorties = Number(r.sorties);
      const ajustements = Number(r.ajustements);
      const stockDebut =
        stockActuel -
        Number(r.achats_depuis_debut) +
        Number(r.ventes_depuis_debut) -
        Number(r.ajust_depuis_debut);
      return {
        id_article: r.id_article,
        designation: r.designation,
        stock_debut: stockDebut,
        entrees,
        sorties,
        ajustements,
        stock_fin: stockDebut + entrees - sorties + ajustements,
        stock_actuel: stockActuel,
      };
    });

    res.json({ du, au, articles });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;