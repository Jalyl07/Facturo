const Anthropic = require('@anthropic-ai/sdk');
const supabase = require('../config/database');

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// POST /api/ia/relance-email
const genererEmailRelance = async (req, res) => {
  const { factureId, tonalite = 'professionnel' } = req.body;

  if (!factureId) {
    return res.status(400).json({ erreur: 'factureId est requis' });
  }

  try {
    // Récupérer la facture avec ses détails
    const { data: facture, error } = await supabase
      .from('factures')
      .select('*, clients(*), lignes_facture(*)')
      .eq('id', factureId)
      .eq('utilisateur_id', req.utilisateur.id)
      .single();

    if (error || !facture) {
      return res.status(404).json({ erreur: 'Facture introuvable' });
    }

    const joursDeRetard = facture.date_echeance
      ? Math.floor((new Date() - new Date(facture.date_echeance)) / (1000 * 60 * 60 * 24))
      : 0;

    const tonalites = {
      amical: 'chaleureux et compréhensif, en restant professionnel',
      professionnel: 'professionnel et courtois',
      ferme: 'ferme et direct, tout en restant respectueux'
    };

    const prompt = `Tu es un assistant de facturation pour l'entreprise "${req.utilisateur.nom_entreprise || req.utilisateur.nom}".

Génère un email de relance de paiement avec le ton suivant : ${tonalites[tonalite] || tonalites.professionnel}.

Informations de la facture :
- Numéro : ${facture.numero}
- Client : ${facture.clients.entreprise || facture.clients.nom} (${facture.clients.email})
- Montant TTC : ${facture.total_ttc} €
- Date d'émission : ${facture.date_emission}
- Date d'échéance : ${facture.date_echeance || 'Non spécifiée'}
- Jours de retard : ${joursDeRetard > 0 ? joursDeRetard : 0}
- Statut : ${facture.statut}

L'email doit inclure :
1. Un objet d'email clair
2. Une salutation appropriée
3. Le rappel de la facture impayée
4. Les coordonnées bancaires fictives pour le paiement (invente des coordonnées IBAN/BIC plausibles)
5. Une invitation à contacter l'expéditeur en cas de problème
6. Une signature professionnelle

Réponds en JSON avec le format :
{
  "objet": "Objet de l'email",
  "corps": "Corps complet de l'email en texte brut"
}`;

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }]
    });

    const contenu = message.content[0].text;

    // Extraire le JSON de la réponse
    const jsonMatch = contenu.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(500).json({ erreur: 'Impossible de générer l\'email' });
    }

    const email = JSON.parse(jsonMatch[0]);

    res.json({
      email,
      facture: {
        numero: facture.numero,
        client: facture.clients.nom,
        montant: facture.total_ttc,
        joursDeRetard: Math.max(0, joursDeRetard)
      },
      tokensUtilises: message.usage.output_tokens
    });
  } catch (err) {
    console.error('Erreur génération email relance:', err);
    res.status(500).json({ erreur: 'Erreur lors de la génération de l\'email de relance' });
  }
};

// POST /api/ia/analyse-risque-client
const analyserRisqueClient = async (req, res) => {
  const { clientId } = req.body;

  if (!clientId) {
    return res.status(400).json({ erreur: 'clientId est requis' });
  }

  try {
    // Récupérer le client et l'historique complet de ses factures
    const { data: client, error: erreurClient } = await supabase
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .eq('utilisateur_id', req.utilisateur.id)
      .single();

    if (erreurClient || !client) {
      return res.status(404).json({ erreur: 'Client introuvable' });
    }

    const { data: factures, error: erreurFactures } = await supabase
      .from('factures')
      .select('numero, statut, total_ttc, date_emission, date_echeance, date_paiement')
      .eq('client_id', clientId)
      .eq('utilisateur_id', req.utilisateur.id)
      .order('date_emission', { ascending: false });

    if (erreurFactures) throw erreurFactures;

    const maintenant = new Date();
    const stats = {
      totalFactures: factures.length,
      facturesPayees: factures.filter(f => f.statut === 'payee').length,
      facturesEnRetard: factures.filter(f => f.statut === 'en_retard').length,
      facturesImpayees: factures.filter(f => ['envoyee', 'en_retard'].includes(f.statut)).length,
      montantTotal: factures.reduce((s, f) => s + parseFloat(f.total_ttc || 0), 0),
      montantImpaye: factures
        .filter(f => ['envoyee', 'en_retard'].includes(f.statut))
        .reduce((s, f) => s + parseFloat(f.total_ttc || 0), 0),
      delaisMoyensPaiement: (() => {
        const payees = factures.filter(f => f.statut === 'payee' && f.date_echeance && f.date_paiement);
        if (!payees.length) return null;
        const delais = payees.map(f =>
          Math.floor((new Date(f.date_paiement) - new Date(f.date_echeance)) / (1000 * 60 * 60 * 24))
        );
        return Math.round(delais.reduce((a, b) => a + b, 0) / delais.length);
      })()
    };

    const prompt = `Tu es un expert en gestion du risque financier pour les PME françaises.

Analyse le profil de risque de ce client et fournis une évaluation détaillée.

Client : ${client.entreprise || client.nom}
Email : ${client.email}
Pays : ${client.pays || 'France'}
Notes : ${client.notes || 'Aucune'}

Historique de facturation :
- Total factures : ${stats.totalFactures}
- Factures payées : ${stats.facturesPayees}
- Factures en retard : ${stats.facturesEnRetard}
- Factures impayées actuellement : ${stats.facturesImpayees}
- Montant total facturé : ${stats.montantTotal.toFixed(2)} €
- Montant actuellement impayé : ${stats.montantImpaye.toFixed(2)} €
- Délai moyen de paiement par rapport à l'échéance : ${stats.delaisMoyensPaiement !== null ? `${stats.delaisMoyensPaiement} jours` : 'Inconnu'}

Factures récentes (5 dernières) :
${factures.slice(0, 5).map(f =>
  `- ${f.numero} : ${f.total_ttc}€, statut: ${f.statut}, émise le ${f.date_emission}, échéance ${f.date_echeance || 'N/A'}`
).join('\n')}

Fournis ton analyse au format JSON strict :
{
  "score_risque": <nombre entre 0 et 100, 0=risque nul, 100=risque maximum>,
  "niveau_risque": "<faible|modere|eleve|critique>",
  "resume": "<résumé en 2-3 phrases>",
  "points_positifs": ["<point 1>", "<point 2>"],
  "points_negatifs": ["<point 1>", "<point 2>"],
  "recommandations": ["<recommandation 1>", "<recommandation 2>", "<recommandation 3>"],
  "limite_credit_suggeree": <montant en euros ou null>
}`;

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: 'Tu es un expert en analyse de risque financier. Réponds toujours en JSON valide uniquement, sans texte supplémentaire.',
      messages: [{ role: 'user', content: prompt }]
    });

    const contenu = message.content[0].text;
    const jsonMatch = contenu.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(500).json({ erreur: 'Impossible d\'analyser le risque' });
    }

    const analyse = JSON.parse(jsonMatch[0]);

    res.json({
      client: { id: client.id, nom: client.entreprise || client.nom, email: client.email },
      statistiques: stats,
      analyse,
      tokensUtilises: message.usage.output_tokens
    });
  } catch (err) {
    console.error('Erreur analyse risque client:', err);
    res.status(500).json({ erreur: 'Erreur lors de l\'analyse du risque client' });
  }
};

module.exports = { genererEmailRelance, analyserRisqueClient };
