const supabase = require('../config/database');
const { PLANS } = require('../config/stripe');

// Vérifie les limites du plan pour les factures
const verifierLimiteFactures = async (req, res, next) => {
  const plan = req.utilisateur.plan || 'starter';
  const limite = PLANS[plan]?.limiteFactures;

  if (limite === null) return next(); // illimité

  const { count, error } = await supabase
    .from('factures')
    .select('id', { count: 'exact', head: true })
    .eq('utilisateur_id', req.utilisateur.id);

  if (error) return res.status(500).json({ erreur: 'Erreur lors de la vérification du plan' });

  if (count >= limite) {
    return res.status(403).json({
      erreur: `Limite atteinte : votre plan ${PLANS[plan].nom} permet ${limite} factures maximum. Passez à un plan supérieur.`,
      upgrade: true
    });
  }

  next();
};

// Vérifie les limites du plan pour les clients
const verifierLimiteClients = async (req, res, next) => {
  const plan = req.utilisateur.plan || 'starter';
  const limite = PLANS[plan]?.limiteClients;

  if (limite === null) return next(); // illimité

  const { count, error } = await supabase
    .from('clients')
    .select('id', { count: 'exact', head: true })
    .eq('utilisateur_id', req.utilisateur.id);

  if (error) return res.status(500).json({ erreur: 'Erreur lors de la vérification du plan' });

  if (count >= limite) {
    return res.status(403).json({
      erreur: `Limite atteinte : votre plan ${PLANS[plan].nom} permet ${limite} clients maximum. Passez à un plan supérieur.`,
      upgrade: true
    });
  }

  next();
};

module.exports = { verifierLimiteFactures, verifierLimiteClients };
