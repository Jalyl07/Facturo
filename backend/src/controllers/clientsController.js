const { validationResult } = require('express-validator');
const supabase = require('../config/database');

// GET /api/clients
const listerClients = async (req, res) => {
  try {
    const { recherche, page = 1, limite = 20 } = req.query;
    const offset = (page - 1) * limite;

    let query = supabase
      .from('clients')
      .select('*', { count: 'exact' })
      .eq('utilisateur_id', req.utilisateur.id)
      .order('cree_le', { ascending: false })
      .range(offset, offset + parseInt(limite) - 1);

    if (recherche) {
      query = query.or(`nom.ilike.%${recherche}%,email.ilike.%${recherche}%,entreprise.ilike.%${recherche}%`);
    }

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({
      clients: data,
      total: count,
      page: parseInt(page),
      pages: Math.ceil(count / limite)
    });
  } catch (err) {
    console.error('Erreur liste clients:', err);
    res.status(500).json({ erreur: 'Erreur lors de la récupération des clients' });
  }
};

// GET /api/clients/:id
const obtenirClient = async (req, res) => {
  try {
    const { data: client, error } = await supabase
      .from('clients')
      .select('*')
      .eq('id', req.params.id)
      .eq('utilisateur_id', req.utilisateur.id)
      .single();

    if (error || !client) {
      return res.status(404).json({ erreur: 'Client introuvable' });
    }

    // Récupérer les statistiques du client
    const { data: stats } = await supabase
      .from('factures')
      .select('statut, total_ttc')
      .eq('client_id', client.id)
      .eq('utilisateur_id', req.utilisateur.id);

    const statistiques = {
      totalFactures: stats?.length || 0,
      montantTotal: stats?.reduce((s, f) => s + parseFloat(f.total_ttc || 0), 0) || 0,
      facturesPayees: stats?.filter(f => f.statut === 'payee').length || 0,
      facturesEnAttente: stats?.filter(f => f.statut === 'envoyee').length || 0,
      facturesEnRetard: stats?.filter(f => f.statut === 'en_retard').length || 0
    };

    res.json({ client, statistiques });
  } catch (err) {
    console.error('Erreur obtenir client:', err);
    res.status(500).json({ erreur: 'Erreur lors de la récupération du client' });
  }
};

// POST /api/clients
const creerClient = async (req, res) => {
  const erreurs = validationResult(req);
  if (!erreurs.isEmpty()) {
    return res.status(400).json({ erreurs: erreurs.array() });
  }

  const { nom, entreprise, email, telephone, adresse, ville, codePostal, pays, siret, tvaIntracom, notes } = req.body;

  try {
    const { data, error } = await supabase
      .from('clients')
      .insert({
        utilisateur_id: req.utilisateur.id,
        nom,
        entreprise: entreprise || null,
        email,
        telephone: telephone || null,
        adresse: adresse || null,
        ville: ville || null,
        code_postal: codePostal || null,
        pays: pays || 'France',
        siret: siret || null,
        tva_intracom: tvaIntracom || null,
        notes: notes || null
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({ message: 'Client créé avec succès', client: data });
  } catch (err) {
    console.error('Erreur créer client:', err);
    res.status(500).json({ erreur: 'Erreur lors de la création du client' });
  }
};

// PUT /api/clients/:id
const modifierClient = async (req, res) => {
  const erreurs = validationResult(req);
  if (!erreurs.isEmpty()) {
    return res.status(400).json({ erreurs: erreurs.array() });
  }

  const { nom, entreprise, email, telephone, adresse, ville, codePostal, pays, siret, tvaIntracom, notes } = req.body;

  try {
    const { data, error } = await supabase
      .from('clients')
      .update({
        nom,
        entreprise: entreprise || null,
        email,
        telephone: telephone || null,
        adresse: adresse || null,
        ville: ville || null,
        code_postal: codePostal || null,
        pays: pays || 'France',
        siret: siret || null,
        tva_intracom: tvaIntracom || null,
        notes: notes || null,
        mis_a_jour_le: new Date().toISOString()
      })
      .eq('id', req.params.id)
      .eq('utilisateur_id', req.utilisateur.id)
      .select()
      .single();

    if (error || !data) {
      return res.status(404).json({ erreur: 'Client introuvable' });
    }

    res.json({ message: 'Client mis à jour', client: data });
  } catch (err) {
    console.error('Erreur modifier client:', err);
    res.status(500).json({ erreur: 'Erreur lors de la mise à jour du client' });
  }
};

// DELETE /api/clients/:id
const supprimerClient = async (req, res) => {
  try {
    // Vérifier qu'il n'y a pas de factures liées
    const { count } = await supabase
      .from('factures')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', req.params.id)
      .eq('utilisateur_id', req.utilisateur.id);

    if (count > 0) {
      return res.status(409).json({
        erreur: `Impossible de supprimer ce client : ${count} facture(s) lui sont associées`
      });
    }

    const { error } = await supabase
      .from('clients')
      .delete()
      .eq('id', req.params.id)
      .eq('utilisateur_id', req.utilisateur.id);

    if (error) throw error;

    res.json({ message: 'Client supprimé avec succès' });
  } catch (err) {
    console.error('Erreur supprimer client:', err);
    res.status(500).json({ erreur: 'Erreur lors de la suppression du client' });
  }
};

module.exports = { listerClients, obtenirClient, creerClient, modifierClient, supprimerClient };
