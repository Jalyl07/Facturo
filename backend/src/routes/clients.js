const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const { authentifier } = require('../middleware/auth');
const { verifierLimiteClients } = require('../middleware/subscription');
const {
  listerClients,
  obtenirClient,
  creerClient,
  modifierClient,
  supprimerClient
} = require('../controllers/clientsController');

const validationClient = [
  body('nom').trim().notEmpty().withMessage('Le nom du client est requis'),
  body('email').isEmail().normalizeEmail().withMessage('Email invalide')
];

router.use(authentifier);

router.get('/', listerClients);
router.get('/:id', obtenirClient);
router.post('/', verifierLimiteClients, validationClient, creerClient);
router.put('/:id', validationClient, modifierClient);
router.delete('/:id', supprimerClient);

module.exports = router;
