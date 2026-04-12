const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const { authentifier } = require('../middleware/auth');
const { verifierLimiteFactures } = require('../middleware/subscription');
const {
  listerFactures,
  obtenirFacture,
  creerFacture,
  modifierFacture,
  supprimerFacture,
  changerStatut,
  tableauDeBord
} = require('../controllers/facturesController');

const validationFacture = [
  body('clientId').notEmpty().withMessage('Le client est requis'),
  body('lignes').isArray({ min: 1 }).withMessage('Au moins une ligne est requise'),
  body('lignes.*.description').trim().notEmpty().withMessage('La description de chaque ligne est requise'),
  body('lignes.*.quantite').isFloat({ min: 0.01 }).withMessage('La quantité doit être supérieure à 0'),
  body('lignes.*.prix_unitaire').isFloat({ min: 0 }).withMessage('Le prix unitaire doit être positif')
];

router.use(authentifier);

router.get('/tableau-de-bord', tableauDeBord);
router.get('/', listerFactures);
router.get('/:id', obtenirFacture);
router.post('/', verifierLimiteFactures, validationFacture, creerFacture);
router.put('/:id', modifierFacture);
router.delete('/:id', supprimerFacture);
router.patch('/:id/statut', changerStatut);

module.exports = router;
