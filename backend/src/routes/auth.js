const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const { authentifier } = require('../middleware/auth');
const {
  inscription,
  connexion,
  moi,
  mettreAJourProfil,
  changerMotDePasse
} = require('../controllers/authController');

const validationInscription = [
  body('nom').trim().notEmpty().withMessage('Le nom est requis'),
  body('email').isEmail().normalizeEmail().withMessage('Email invalide'),
  body('motDePasse')
    .isLength({ min: 8 })
    .withMessage('Le mot de passe doit contenir au moins 8 caractères')
    .matches(/[A-Z]/).withMessage('Le mot de passe doit contenir au moins une majuscule')
    .matches(/[0-9]/).withMessage('Le mot de passe doit contenir au moins un chiffre')
];

const validationConnexion = [
  body('email').isEmail().normalizeEmail().withMessage('Email invalide'),
  body('motDePasse').notEmpty().withMessage('Le mot de passe est requis')
];

router.post('/inscription', validationInscription, inscription);
router.post('/connexion', validationConnexion, connexion);
router.post('/register', validationInscription, inscription);
router.post('/login', validationConnexion, connexion);
router.get('/moi', authentifier, moi);
router.put('/profil', authentifier, mettreAJourProfil);
router.post('/changer-mot-de-passe', authentifier, changerMotDePasse);

module.exports = router;
