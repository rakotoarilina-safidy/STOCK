const express = require('express');
const pool = require('../config/db');
const { authentifier } = require('../middleware/auth');

const router = express.Router();
router.use(authentifier);

const SELECT_ARTICLES = `
  SELECT a.id_article, a.designation, a.id_categorie, c.nom_categorie AS categorie,
         a.prix_achat, a.prix_vente_detail, a.prix_vente_gros, a.quantite_gros, a.conditionnement,
         a.quantite_stock, a.seuil_alerte, a.date_ajout
  FROM ARTICLES a
  JOIN CATEGORIES c ON c.id_categorie = a.id_categorie`;

function erreur(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

// Vérifie et nettoie les champs envoyés ; renvoie les valeurs prêtes à enregistrer
function lireChamps(b) {
  const designation = (b.designation || '').toString().trim();
  if (!designation) throw erreur(400, 'La désignation est requise');

  const prix = {};
  for (const champ of ['prix_achat', 'prix_vente_detail', 'prix_vente_gros']) {
    const v = b[champ] === undefined || b[champ] === '' ? 0 : Number(b[champ]);
    if (isNaN(v) || v < 0) throw erreur(400, 'Les prix doivent être des nombres positifs');
    prix[champ] = v;
  }

  const seuil = b.seuil_alerte === undefined || b.seuil_alerte === '' ? 0 : Number(b.seuil_alerte);
  if (!Number.isInteger(seuil) || seuil < 0) {
    throw erreur(400, 'Le seuil d’alerte doit être un nombre entier positif');
  }

  const lot = b.quantite_gros === undefined || b.quantite_gros === '' ? 1 : Number(b.quantite_gros);
  if (!Number.isInteger(lot) || lot < 1) {
    throw erreur(400, 'Le nombre d’unités en gros doit être un entier supérieur ou égal à 1');
  }

  // Nature du lot de gros : carton, boîte, pack... (texte libre)
  let conditionnement = (b.conditionnement || 'Carton').toString().trim().replace(/\s+/g, ' ');
  if (!conditionnement) conditionnement = 'Carton';
  if (conditionnement.length > 40) {
    throw erreur(400, 'Le conditionnement est trop long (40 caractères maximum)');
  }
  conditionnement = conditionnement.charAt(0).toUpperCase() + conditionnement.slice(1);

  return { designation, ...prix, seuil_alerte: seuil, quantite_gros: lot, conditionnement };
}

// Trouve la catégorie par son nom (sans tenir compte des majuscules ni des accents),
// ou la crée si elle n'existe pas encore. Vide = « Autres ».
async function idCategorie(conn, nomBrut) {
  let nom = (nomBrut || 'Autres').toString().trim().replace(/\s+/g, ' ');
  if (!nom) nom = 'Autres';
  if (nom.length > 60) throw erreur(400, 'Le nom de la catégorie est trop long (60 caractères maximum)');
  nom = nom.charAt(0).toUpperCase() + nom.slice(1);

  const [rows] = await conn.query('SELECT id_categorie FROM CATEGORIES WHERE nom_categorie = ?', [nom]);
  if (rows.length) return rows[0].id_categorie;

  try {
    const [r] = await conn.query('INSERT INTO CATEGORIES (nom_categorie) VALUES (?)', [nom]);
    return r.insertId;
  } catch (err) {
    if (err.code !== 'ER_DUP_ENTRY') throw err;
    const [again] = await conn.query('SELECT id_categorie FROM CATEGORIES WHERE nom_categorie = ?', [nom]);
    return again[0].id_categorie;
  }
}

// Liste + recherche : GET /api/articles?q=riz&stock_bas=1&id_categorie=2
router.get('/', async (req, res) => {
  try {
    const conditions = [];
    const params = [];
    if (req.query.q) {
      conditions.push('a.designation LIKE ?');
      params.push(`%${req.query.q}%`);
    }
    if (req.query.stock_bas === '1') {
      conditions.push('a.quantite_stock <= a.seuil_alerte');
    }
    if (req.query.id_categorie) {
      conditions.push('a.id_categorie = ?');
      params.push(req.query.id_categorie);
    }
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const [rows] = await pool.query(`${SELECT_ARTICLES} ${where} ORDER BY a.designation`, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Un article (stock restant)
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(`${SELECT_ARTICLES} WHERE a.id_article = ?`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Article introuvable' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Création
router.post('/', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const c = lireChamps(req.body);
    const idCat = await idCategorie(conn, req.body.categorie);
    const [r] = await conn.query(
      `INSERT INTO ARTICLES
         (designation, id_categorie, prix_achat, prix_vente_detail, prix_vente_gros, quantite_gros, conditionnement, seuil_alerte)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [c.designation, idCat, c.prix_achat, c.prix_vente_detail, c.prix_vente_gros, c.quantite_gros, c.conditionnement, c.seuil_alerte]
    );
    res.status(201).json({ id_article: r.insertId });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  } finally {
    conn.release();
  }
});

// Modification : le stock n'est pas modifiable ici (il bouge par les ventes et les livraisons)
router.put('/:id', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const c = lireChamps(req.body);
    const idCat = await idCategorie(conn, req.body.categorie);
    const [r] = await conn.query(
      `UPDATE ARTICLES
       SET designation = ?, id_categorie = ?, prix_achat = ?, prix_vente_detail = ?,
           prix_vente_gros = ?, quantite_gros = ?, conditionnement = ?, seuil_alerte = ?
       WHERE id_article = ?`,
      [c.designation, idCat, c.prix_achat, c.prix_vente_detail, c.prix_vente_gros, c.quantite_gros, c.conditionnement, c.seuil_alerte, req.params.id]
    );
    if (!r.affectedRows) return res.status(404).json({ message: 'Article introuvable' });
    res.json({ message: 'Article modifié' });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  } finally {
    conn.release();
  }
});

// Suppression : refusée si l'article a déjà un historique
router.delete('/:id', async (req, res) => {
  try {
    const [r] = await pool.query('DELETE FROM ARTICLES WHERE id_article = ?', [req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ message: 'Article introuvable' });
    res.json({ message: 'Article supprimé' });
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(409).json({
        message: 'Impossible de supprimer : cet article a déjà des ventes ou des achats',
      });
    }
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;