const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const supabase = require('../config/database');
const { stripe } = require('../config/stripe');

const genererToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
};

// POST /api/auth/inscription
const inscription = async (req, res) => {
  const erreurs = validationResult(req);
  if (!erreurs.isEmpty()) {
    return res.status(400).json({ erreurs: erreurs.array() });
  }

  const { nom, email, motDePasse, nomEntreprise, siret } = req.body;

  try {
    // Vérifier si l'email existe déjà
    const { data: existant } = await supabase
      .from('utilisateurs')
      .select('id')
      .eq('email', email)
      .single();

    if (existant) {
      return res.status(409).json({ erreur: 'Cet email est déjà utilisé' });
    }

    // Hasher le mot de passe
    const hash = await bcrypt.hash(motDePasse, 12);

    // Créer le client Stripe
    const stripeCustomer = await stripe.customers.create({
      email,
      name: nomEntreprise || nom,
      metadata: { source: 'facturo' }
    });

    // Créer l'utilisateur en base
    const { data: utilisateur, error } = await supabase
      .from('utilisateurs')
      .insert({
        nom,
        email,
        mot_de_passe: hash,
        nom_entreprise: nomEntreprise || null,
        siret: siret || null,
        plan: 'starter',
        stripe_customer_id: stripeCustomer.id,
        actif: true
      })
      .select('id, nom, email, nom_entreprise, plan')
      .single();

    if (error) throw error;

    const token = genererToken(utilisateur.id);

    res.status(201).json({
      message: 'Compte créé avec succès',
      token,
      utilisateur
    });
  } catch (err) {
    console.error('Erreur inscription:', err);
    res.status(500).json({ erreur: 'Erreur lors de la création du compte' });
  }
};

// POST /api/auth/connexion
const connexion = async (req, res) => {
  const erreurs = validationResult(req);
  if (!erreurs.isEmpty()) {
    return res.status(400).json({ erreurs: erreurs.array() });
  }

  const { email, motDePasse } = req.body;

  try {
    const { data: utilisateur, error } = await supabase
      .from('utilisateurs')
      .select('id, nom, email, mot_de_passe, nom_entreprise, plan, actif')
      .eq('email', email)
      .single();

    if (error || !utilisateur) {
      return res.status(401).json({ erreur: 'Email ou mot de passe incorrect' });
    }

    if (!utilisateur.actif) {
      return res.status(403).json({ erreur: 'Compte désactivé, contactez le support' });
    }

    const motDePasseValide = await bcrypt.compare(motDePasse, utilisateur.mot_de_passe);
    if (!motDePasseValide) {
      return res.status(401).json({ erreur: 'Email ou mot de passe incorrect' });
    }

    const token = genererToken(utilisateur.id);
    const { mot_de_passe, ...utilisateurSansMdp } = utilisateur;

    res.json({
      message: 'Connexion réussie',
      token,
      utilisateur: utilisateurSansMdp
    });
  } catch (err) {
    console.error('Erreur connexion:', err);
    res.status(500).json({ erreur: 'Erreur lors de la connexion' });
  }
};

// GET /api/auth/moi
const moi = async (req, res) => {
  res.json({ utilisateur: req.utilisateur });
};

// PUT /api/auth/profil
const mettreAJourProfil = async (req, res) => {
  const { nom, nomEntreprise, siret, telephone, adresse } = req.body;

  try {
    const { data, error } = await supabase
      .from('utilisateurs')
      .update({
        nom,
        nom_entreprise: nomEntreprise,
        siret,
        telephone,
        adresse,
        mis_a_jour_le: new Date().toISOString()
      })
      .eq('id', req.utilisateur.id)
      .select('id, nom, email, nom_entreprise, siret, telephone, adresse, plan')
      .single();

    if (error) throw error;

    res.json({ message: 'Profil mis à jour', utilisateur: data });
  } catch (err) {
    console.error('Erreur mise à jour profil:', err);
    res.status(500).json({ erreur: 'Erreur lors de la mise à jour du profil' });
  }
};

// POST /api/auth/changer-mot-de-passe
const changerMotDePasse = async (req, res) => {
  const { ancienMotDePasse, nouveauMotDePasse } = req.body;

  try {
    const { data: utilisateur } = await supabase
      .from('utilisateurs')
      .select('mot_de_passe')
      .eq('id', req.utilisateur.id)
      .single();

    const valide = await bcrypt.compare(ancienMotDePasse, utilisateur.mot_de_passe);
    if (!valide) {
      return res.status(401).json({ erreur: 'Ancien mot de passe incorrect' });
    }

    const hash = await bcrypt.hash(nouveauMotDePasse, 12);
    await supabase
      .from('utilisateurs')
      .update({ mot_de_passe: hash })
      .eq('id', req.utilisateur.id);

    res.json({ message: 'Mot de passe modifié avec succès' });
  } catch (err) {
    console.error('Erreur changement mot de passe:', err);
    res.status(500).json({ erreur: 'Erreur lors du changement de mot de passe' });
  }
};

module.exports = { inscription, connexion, moi, mettreAJourProfil, changerMotDePasse };
