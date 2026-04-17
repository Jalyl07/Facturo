const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const clientsRoutes = require('./routes/clients');
const facturesRoutes = require('./routes/factures');
const iaRoutes = require('./routes/ia');
const stripeRoutes = require('./routes/stripe');
const claudeRoutes = require('./routes/claude');

const app = express();

// Sécurité
app.use(helmet());

// Rate limiting global
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: { erreur: 'Trop de requêtes, veuillez réessayer plus tard.' }
});
app.use(limiter);

// CORS
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:5173',
  'https://frontend-two-khaki-14.vercel.app',
  'https://facturai.tech',
  'https://www.facturai.tech',
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.some(o => origin.startsWith(o))) {
      callback(null, true);
    } else {
      callback(new Error('CORS non autorisé : ' + origin));
    }
  },
  credentials: true
}));

// Le webhook Stripe doit recevoir le body brut (avant json())
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));

// Parse JSON
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/clients', clientsRoutes);
app.use('/api/factures', facturesRoutes);
app.use('/api/ia', iaRoutes);
app.use('/api/stripe', stripeRoutes);
app.use('/api/claude', claudeRoutes);

// Route de santé
app.get('/api/health', (req, res) => {
  res.json({ statut: 'ok', service: 'Facturo API', version: '1.0.0' });
});

// Gestion des routes inexistantes
app.use((req, res) => {
  res.status(404).json({ erreur: 'Route introuvable' });
});

// Gestion globale des erreurs
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    erreur: err.message || 'Erreur interne du serveur'
  });
});

module.exports = app;
