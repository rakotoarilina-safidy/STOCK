const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/utilisateurs', require('./routes/utilisateurs.routes'));
app.use('/api/articles', require('./routes/articles.routes'));
app.use('/api/fournisseurs', require('./routes/fournisseurs.routes'));
app.use('/api/achats', require('./routes/achats.routes'));
app.use('/api/ventes', require('./routes/ventes.routes'));
app.use('/api/inventaire', require('./routes/inventaire.routes'));
app.use('/api/statistiques', require('./routes/statistiques.routes'));
app.use('/api/sauvegardes', require('./routes/sauvegardes.routes'));

module.exports = app;