const { stripe, PLANS } = require('../config/stripe');
const supabase = require('../config/database');

// POST /api/stripe/creer-session-abonnement
const creerSessionAbonnement = async (req, res) => {
  const { plan } = req.body;

  if (!PLANS[plan]) {
    return res.status(400).json({ erreur: `Plan invalide. Choisissez parmi : ${Object.keys(PLANS).join(', ')}` });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      customer: req.utilisateur.stripe_customer_id,
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [
        {
          price: PLANS[plan].priceId,
          quantity: 1
        }
      ],
      success_url: `${process.env.FRONTEND_URL}/abonnement/succes?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/abonnement/annule`,
      metadata: {
        utilisateur_id: req.utilisateur.id,
        plan
      }
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('Erreur création session Stripe:', err);
    res.status(500).json({ erreur: 'Erreur lors de la création de la session de paiement' });
  }
};

// POST /api/stripe/portail-client
const portalClient = async (req, res) => {
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: req.utilisateur.stripe_customer_id,
      return_url: `${process.env.FRONTEND_URL}/parametres/abonnement`
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('Erreur portail Stripe:', err);
    res.status(500).json({ erreur: 'Erreur lors de l\'accès au portail de facturation' });
  }
};

// GET /api/stripe/abonnement
const obtenirAbonnement = async (req, res) => {
  try {
    const { data: utilisateur } = await supabase
      .from('utilisateurs')
      .select('plan, stripe_subscription_id, stripe_customer_id')
      .eq('id', req.utilisateur.id)
      .single();

    let abonnementStripe = null;
    if (utilisateur.stripe_subscription_id) {
      abonnementStripe = await stripe.subscriptions.retrieve(utilisateur.stripe_subscription_id);
    }

    res.json({
      plan: utilisateur.plan || 'starter',
      details: PLANS[utilisateur.plan || 'starter'],
      abonnement: abonnementStripe ? {
        statut: abonnementStripe.status,
        prochainPaiement: abonnementStripe.current_period_end
          ? new Date(abonnementStripe.current_period_end * 1000).toISOString()
          : null,
        annulationPrevue: abonnementStripe.cancel_at_period_end
      } : null
    });
  } catch (err) {
    console.error('Erreur obtenir abonnement:', err);
    res.status(500).json({ erreur: 'Erreur lors de la récupération de l\'abonnement' });
  }
};

// GET /api/stripe/plans
const listerPlans = async (req, res) => {
  res.json({ plans: PLANS });
};

// POST /api/stripe/webhook
const webhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Erreur vérification webhook Stripe:', err.message);
    return res.status(400).json({ erreur: `Webhook invalide : ${err.message}` });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const utilisateurId = session.metadata?.utilisateur_id;
        const plan = session.metadata?.plan;

        if (utilisateurId && plan) {
          await supabase
            .from('utilisateurs')
            .update({
              plan,
              stripe_subscription_id: session.subscription,
              mis_a_jour_le: new Date().toISOString()
            })
            .eq('id', utilisateurId);

          console.log(`Plan mis à jour : utilisateur ${utilisateurId} → ${plan}`);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const customer = await stripe.customers.retrieve(subscription.customer);

        const { data: utilisateur } = await supabase
          .from('utilisateurs')
          .select('id')
          .eq('stripe_customer_id', subscription.customer)
          .single();

        if (utilisateur) {
          // Déterminer le plan depuis le priceId
          const priceId = subscription.items.data[0]?.price?.id;
          const plan = Object.keys(PLANS).find(k => PLANS[k].priceId === priceId) || 'starter';

          await supabase
            .from('utilisateurs')
            .update({ plan, mis_a_jour_le: new Date().toISOString() })
            .eq('id', utilisateur.id);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;

        const { data: utilisateur } = await supabase
          .from('utilisateurs')
          .select('id')
          .eq('stripe_customer_id', subscription.customer)
          .single();

        if (utilisateur) {
          await supabase
            .from('utilisateurs')
            .update({ plan: 'starter', stripe_subscription_id: null, mis_a_jour_le: new Date().toISOString() })
            .eq('id', utilisateur.id);
        }
        break;
      }

      default:
        console.log(`Événement Stripe non géré : ${event.type}`);
    }

    res.json({ recu: true });
  } catch (err) {
    console.error('Erreur traitement webhook:', err);
    res.status(500).json({ erreur: 'Erreur interne lors du traitement du webhook' });
  }
};

module.exports = { creerSessionAbonnement, portalClient, obtenirAbonnement, listerPlans, webhook };
