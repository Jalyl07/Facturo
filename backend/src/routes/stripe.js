const express = require('express');
const router = express.Router();
const { authentifier } = require('../middleware/auth');
const {
  creerSessionAbonnement,
  portalClient,
  obtenirAbonnement,
  listerPlans,
  webhook
} = require('../controllers/stripeController');

// Webhook sans authentification JWT (Stripe signe sa propre requête)
router.post('/webhook', webhook);

router.use(authentifier);

router.get('/plans', listerPlans);
router.get('/abonnement', obtenirAbonnement);
router.post('/creer-session-abonnement', creerSessionAbonnement);
router.post('/create-checkout-session', creerSessionAbonnement);
router.post('/portail-client', portalClient);
router.post('/portal-session', portalClient);

module.exports = router;
