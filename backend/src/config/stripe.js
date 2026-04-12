const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-12-18.acacia'
});

const PLANS = {
  starter: {
    nom: 'Starter',
    prix: 9,
    priceId: process.env.STRIPE_PRICE_STARTER,
    limiteFactures: 20,
    limiteClients: 10
  },
  pro: {
    nom: 'Pro',
    prix: 19,
    priceId: process.env.STRIPE_PRICE_PRO,
    limiteFactures: 100,
    limiteClients: 50
  },
  business: {
    nom: 'Business',
    prix: 39,
    priceId: process.env.STRIPE_PRICE_BUSINESS,
    limiteFactures: null, // illimité
    limiteClients: null   // illimité
  }
};

module.exports = { stripe, PLANS };
