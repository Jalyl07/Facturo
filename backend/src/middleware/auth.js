const jwt = require('jsonwebtoken');
const supabase = require('../config/database');

const authentifier = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ erreur: 'Token d\'authentification manquant' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Vérifier que l'utilisateur existe toujours
    const { data: utilisateur, error } = await supabase
      .from('utilisateurs')
      .select('id, email, nom, plan, stripe_customer_id, actif')
      .eq('id', decoded.id)
      .single();

    if (error || !utilisateur) {
      return res.status(401).json({ erreur: 'Utilisateur introuvable' });
    }

    if (!utilisateur.actif) {
      return res.status(403).json({ erreur: 'Compte désactivé' });
    }

    req.utilisateur = utilisateur;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ erreur: 'Token expiré, veuillez vous reconnecter' });
    }
    return res.status(401).json({ erreur: 'Token invalide' });
  }
};

module.exports = { authentifier };
