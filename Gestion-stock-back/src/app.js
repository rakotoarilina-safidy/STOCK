const path = require('path');
const express = require('express');
const cors = require('cors');
const { dossier, disponible } = require('./config/interface');

const app = express();
app.use(cors());
app.use(express.json());

// ---------- API ----------
app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/utilisateurs', require('./routes/utilisateurs.routes'));
app.use('/api/articles', require('./routes/articles.routes'));
app.use('/api/categories', require('./routes/categories.routes'));
app.use('/api/fournisseurs', require('./routes/fournisseurs.routes'));
app.use('/api/achats', require('./routes/achats.routes'));
app.use('/api/ventes', require('./routes/ventes.routes'));
app.use('/api/inventaire', require('./routes/inventaire.routes'));
app.use('/api/caisse', require('./routes/caisse.routes'));
app.use('/api/stock', require('./routes/stock.routes'));
app.use('/api/statistiques', require('./routes/statistiques.routes'));
app.use('/api/sauvegardes', require('./routes/sauvegardes.routes'));
app.use('/api/reseau', require('./routes/reseau.routes'));

// ---------- Interface (pour les autres PC du magasin) ----------
// Le serveur envoie lui-même l'interface : un deuxième PC n'a qu'à ouvrir son adresse.
app.use(express.static(dossier()));
app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api') || !disponible()) return next();
  res.sendFile(path.join(dossier(), 'index.html'));
});

module.exports = app;