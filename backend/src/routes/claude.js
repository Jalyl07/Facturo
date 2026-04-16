const express = require('express');
const rateLimit = require('express-rate-limit');
const Anthropic = require('@anthropic-ai/sdk');
const router = express.Router();

const limiteIA = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 heure
  max: 50,
  message: { erreur: 'Limite d\'utilisation de l\'IA atteinte. Réessayez dans une heure.' }
});

router.use(limiteIA);

router.post('/', async (req, res) => {
  const { messages, system } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ erreur: 'Le champ "messages" est requis.' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ erreur: 'Clé API Claude non configurée sur le serveur.' });
  }

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const params = {
      model: 'claude-sonnet-4-5',
      max_tokens: 1024,
      messages,
    };
    if (system) params.system = system;

    const response = await client.messages.create(params);
    const text = response.content?.[0]?.text || '';
    res.json({ text });
  } catch (err) {
    console.error('Erreur API Claude :', err.message);
    res.status(502).json({ erreur: err.message || 'Erreur lors de l\'appel à Claude.' });
  }
});

module.exports = router;
