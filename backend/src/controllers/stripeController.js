const { stripe, PLANS } = require('../config/stripe');
const supabase = require('../config/database');

// POST /api/stripe/creer-session-abonnement  /  /api/stripe/create-checkout-session
const creerSessionAbonnement = async (req, res) => {
  const { plan } = req.body;
  console.log(`[Stripe] create-checkout-session — user=${req.utilisateur?.id} plan=${plan}`);

  if (!PLANS[plan]) {
    return res.status(400).json({ erreur: `Plan invalide. Valeurs acceptées : ${Object.keys(PLANS).join(', ')}` });
  }

  const priceId = PLANS[plan].priceId;
  if (!priceId) {
    console.error(`[Stripe] STRIPE_PRICE_${plan.toUpperCase()} non défini dans les variables d'environnement`);
    return res.status(500).json({ erreur: `Prix Stripe non configuré pour le plan "${plan}". Vérifiez STRIPE_PRICE_${plan.toUpperCase()} dans Railway.` });
  }

  try {
    let customerId = req.utilisateur.stripe_customer_id;

    // Créer le customer Stripe à la volée s'il est absent
    if (!customerId) {
      console.log(`[Stripe] stripe_customer_id absent pour user=${req.utilisateur.id} — création à la volée`);
      const customer = await stripe.customers.create({
        email: req.utilisateur.email,
        name: req.utilisateur.nom,
        metadata: { utilisateur_id: String(req.utilisateur.id) }
      });
      customerId = customer.id;
      await supabase
        .from('utilisateurs')
        .update({ stripe_customer_id: customerId })
        .eq('id', req.utilisateur.id);
      console.log(`[Stripe] Customer créé : ${customerId}`);
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `https://frontend-two-khaki-14.vercel.app/success?plan=${plan}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `https://frontend-two-khaki-14.vercel.app/`,
      metadata: { utilisateur_id: String(req.utilisateur.id), plan }
    });

    console.log(`[Stripe] Session créée : ${session.id} → ${session.url}`);
    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('[Stripe] Erreur création session:', err.type, err.code, err.message);
    res.status(500).json({ erreur: `Erreur Stripe : ${err.message}` });
  }
};

// POST /api/stripe/portail-client  (alias: portal-session)
const portalClient = async (req, res) => {
  if (!req.utilisateur.stripe_customer_id) {
    return res.status(400).json({ erreur: 'Aucun identifiant client Stripe associé à ce compte. Souscrivez d\'abord à un plan.' });
  }
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: req.utilisateur.stripe_customer_id,
      return_url: process.env.FRONTEND_URL || 'https://facturai.tech'
    });
    console.log(`[Stripe] Portail client créé pour user=${req.utilisateur.id} → ${session.url}`);
    res.json({ url: session.url });
  } catch (err) {
    console.error('Erreur portail Stripe:', err);
    res.status(500).json({ erreur: 'Erreur lors de l\'accès au portail de facturation : ' + err.message });
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
  console.log('[Webhook] Secret présent:', !!process.env.STRIPE_WEBHOOK_SECRET);
  const sig = req.headers['stripe-signature'];
  let event;

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.warn('[Webhook] STRIPE_WEBHOOK_SECRET absent — parsing sans vérification de signature');
    try {
      const raw = req.body;
      const body = typeof raw === 'string' ? raw : raw.toString('utf8');
      event = JSON.parse(body);
    } catch (parseErr) {
      console.error('[Webhook] Impossible de parser le body:', parseErr.message);
      return res.status(400).json({ erreur: 'Body invalide' });
    }
  } else {
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      console.error('[Webhook] Signature invalide:', err.message);
      return res.status(400).json({ erreur: `Webhook invalide : ${err.message}` });
    }
  }

  console.log(`[Webhook] Événement reçu : ${event.type} (id=${event.id})`);

  // Répondre 200 immédiatement pour éviter le timeout Stripe
  res.json({ recu: true });

  try {
    switch (event.type) {

      case 'checkout.session.completed': {
        const session = event.data.object;
        const utilisateurId = session.metadata?.utilisateur_id;
        const plan = session.metadata?.plan;
        const customerId = session.customer;

        console.log(`[Webhook] checkout.session.completed — customer=${customerId} utilisateur_id=${utilisateurId} plan=${plan}`);

        if (!plan) {
          console.warn('[Webhook] plan absent dans les metadata — abandon');
          break;
        }

        // Stratégie 1 : lookup par utilisateur_id (metadata)
        if (utilisateurId) {
          const { error } = await supabase
            .from('utilisateurs')
            .update({
              plan,
              stripe_subscription_id: session.subscription,
              mis_a_jour_le: new Date().toISOString()
            })
            .eq('id', utilisateurId);

          if (!error) {
            console.log(`[Webhook] ✓ Plan mis à jour via utilisateur_id=${utilisateurId} → ${plan}`);
            break;
          }
          console.warn('[Webhook] Mise à jour par utilisateur_id échouée, fallback sur stripe_customer_id');
        }

        // Stratégie 2 : fallback par stripe_customer_id
        if (customerId) {
          const { data: utilisateur, error } = await supabase
            .from('utilisateurs')
            .select('id, email')
            .eq('stripe_customer_id', customerId)
            .single();

          if (error || !utilisateur) {
            console.error(`[Webhook] Utilisateur introuvable pour customer=${customerId}`);
            break;
          }

          await supabase
            .from('utilisateurs')
            .update({
              plan,
              stripe_subscription_id: session.subscription,
              mis_a_jour_le: new Date().toISOString()
            })
            .eq('id', utilisateur.id);

          console.log(`[Webhook] ✓ Plan mis à jour via stripe_customer_id → user=${utilisateur.email} plan=${plan}`);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const priceId = subscription.items.data[0]?.price?.id;
        const plan = Object.keys(PLANS).find(k => PLANS[k].priceId === priceId) || 'starter';

        console.log(`[Webhook] customer.subscription.updated — customer=${subscription.customer} priceId=${priceId} → plan=${plan}`);

        const { data: utilisateur } = await supabase
          .from('utilisateurs')
          .select('id, email')
          .eq('stripe_customer_id', subscription.customer)
          .single();

        if (!utilisateur) {
          console.warn(`[Webhook] Utilisateur introuvable pour customer=${subscription.customer}`);
          break;
        }

        await supabase
          .from('utilisateurs')
          .update({ plan, mis_a_jour_le: new Date().toISOString() })
          .eq('id', utilisateur.id);

        console.log(`[Webhook] ✓ Plan mis à jour → user=${utilisateur.email} plan=${plan}`);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;

        console.log(`[Webhook] customer.subscription.deleted — customer=${subscription.customer}`);

        const { data: utilisateur } = await supabase
          .from('utilisateurs')
          .select('id, email')
          .eq('stripe_customer_id', subscription.customer)
          .single();

        if (!utilisateur) {
          console.warn(`[Webhook] Utilisateur introuvable pour customer=${subscription.customer}`);
          break;
        }

        await supabase
          .from('utilisateurs')
          .update({
            plan: 'starter',
            stripe_subscription_id: null,
            mis_a_jour_le: new Date().toISOString()
          })
          .eq('id', utilisateur.id);

        console.log(`[Webhook] ✓ Abonnement annulé → user=${utilisateur.email} remis sur starter`);
        break;
      }

      default:
        console.log(`[Webhook] Événement non géré : ${event.type}`);
    }
  } catch (err) {
    console.error('[Webhook] Erreur traitement:', err.message, err.stack);
  }
};

module.exports = { creerSessionAbonnement, portalClient, obtenirAbonnement, listerPlans, webhook };
