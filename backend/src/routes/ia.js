const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { authentifier } = require('../middleware/auth');
const { genererEmailRelance, analyserRisqueClient } = require('../controllers/iaController');

// Rate limiting strict pour les endpoints IA (coûteux)
const limiteIA = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 heure
  max: 20,
  message: { erreur: 'Limite d\'utilisation de l\'IA atteinte. Réessayez dans une heure.' }
});

router.use(authentifier);
router.use(limiteIA);

router.post('/relance-email', genererEmailRelance);
router.post('/analyse-risque-client', analyserRisqueClient);

module.exports = router;
