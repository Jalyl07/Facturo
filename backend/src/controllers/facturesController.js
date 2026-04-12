const { validationResult } = require('express-validator');
const supabase = require('../config/database');

// Génère le numéro de facture automatique : FAC-2026-001
const genererNumero = async (utilisateurId) => {
  const annee = new Date().getFullYear();
  const prefixe = `FAC-${annee}-`;

  const { data } = await supabase
    .from('factures')
    .select('numero')
    .eq('utilisateur_id', utilisateurId)
    .like('numero', `${prefixe}%`)
    .order('numero', { ascending: false })
    .limit(1);

  if (!data || data.length === 0) {
    return `${prefixe}001`;
  }

  const dernierNumero = data[0].numero;
  const sequence = parseInt(dernierNumero.split('-')[2], 10);
  return `${prefixe}${String(sequence + 1).padStart(3, '0')}`;
};

// Calcule les montants HT/TVA/TTC depuis les lignes
const calculerMontants = (lignes) => {
  let totalHT = 0;
  let totalTVA = 0;

  const lignesCalculees = lignes.map(ligne => {
    const quantite = parseFloat(ligne.quantite) || 0;
    const prixUnitaire = parseFloat(ligne.prix_unitaire) || 0;
    const tauxTVA = parseFloat(ligne.taux_tva) || 20;
    const remise = parseFloat(ligne.remise) || 0;

    const montantHT = quantite * prixUnitaire * (1 - remise / 100);
    const montantTVA = montantHT * (tauxTVA / 100);

    totalHT += montantHT;
    totalTVA += montantTVA;

    return {
      ...ligne,
      montant_ht: Math.round(montantHT * 100) / 100,
      montant_tva: Math.round(montantTVA * 100) / 100,
      montant_ttc: Math.round((montantHT + montantTVA) * 100) / 100
    };
  });

  return {
    lignes: lignesCalculees,
    total_ht: Math.round(totalHT * 100) / 100,
    total_tva: Math.round(totalTVA * 100) / 100,
    total_ttc: Math.round((totalHT + totalTVA) * 100) / 100
  };
};

// GET /api/factures
const listerFactures = async (req, res) => {
  try {
    const { statut, clientId, page = 1, limite = 20, recherche } = req.query;
    const offset = (page - 1) * limite;

    let query = supabase
      .from('factures')
      .select(`
        *,
        clients (id, nom, entreprise, email)
      `, { count: 'exact' })
      .eq('utilisateur_id', req.utilisateur.id)
      .order('cree_le', { ascending: false })
      .range(offset, offset + parseInt(limite) - 1);

    if (statut) query = query.eq('statut', statut);
    if (clientId) query = query.eq('client_id', clientId);
    if (recherche) query = query.ilike('numero', `%${recherche}%`);

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({
      factures: data,
      total: count,
      page: parseInt(page),
      pages: Math.ceil(count / limite)
    });
  } catch (err) {
    console.error('Erreur liste factures:', err);
    res.status(500).json({ erreur: 'Erreur lors de la récupération des factures' });
  }
};

// GET /api/factures/:id
const obtenirFacture = async (req, res) => {
  try {
    const { data: facture, error } = await supabase
      .from('factures')
      .select(`
        *,
        clients (*),
        lignes_facture (*)
      `)
      .eq('id', req.params.id)
      .eq('utilisateur_id', req.utilisateur.id)
      .single();

    if (error || !facture) {
      return res.status(404).json({ erreur: 'Facture introuvable' });
    }

    res.json({ facture });
  } catch (err) {
    console.error('Erreur obtenir facture:', err);
    res.status(500).json({ erreur: 'Erreur lors de la récupération de la facture' });
  }
};

// POST /api/factures
const creerFacture = async (req, res) => {
  const erreurs = validationResult(req);
  if (!erreurs.isEmpty()) {
    return res.status(400).json({ erreurs: erreurs.array() });
  }

  const { clientId, lignes, dateEmission, dateEcheance, notes, conditionsPaiement, mentionsLegales } = req.body;

  try {
    // Vérifier que le client appartient à l'utilisateur
    const { data: client } = await supabase
      .from('clients')
      .select('id')
      .eq('id', clientId)
      .eq('utilisateur_id', req.utilisateur.id)
      .single();

    if (!client) {
      return res.status(404).json({ erreur: 'Client introuvable' });
    }

    const numero = await genererNumero(req.utilisateur.id);
    const { lignes: lignesCalculees, total_ht, total_tva, total_ttc } = calculerMontants(lignes);

    // Créer la facture
    const { data: facture, error: erreurFacture } = await supabase
      .from('factures')
      .insert({
        utilisateur_id: req.utilisateur.id,
        client_id: clientId,
        numero,
        statut: 'brouillon',
        date_emission: dateEmission || new Date().toISOString().split('T')[0],
        date_echeance: dateEcheance || null,
        total_ht,
        total_tva,
        total_ttc,
        notes: notes || null,
        conditions_paiement: conditionsPaiement || 'Paiement à 30 jours',
        mentions_legales: mentionsLegales || null
      })
      .select()
      .single();

    if (erreurFacture) throw erreurFacture;

    // Insérer les lignes de facture
    const lignesAAjouter = lignesCalculees.map((ligne, index) => ({
      facture_id: facture.id,
      utilisateur_id: req.utilisateur.id,
      ordre: index + 1,
      description: ligne.description,
      quantite: ligne.quantite,
      unite: ligne.unite || 'unité',
      prix_unitaire: ligne.prix_unitaire,
      taux_tva: ligne.taux_tva || 20,
      remise: ligne.remise || 0,
      montant_ht: ligne.montant_ht,
      montant_tva: ligne.montant_tva,
      montant_ttc: ligne.montant_ttc
    }));

    const { error: erreurLignes } = await supabase
      .from('lignes_facture')
      .insert(lignesAAjouter);

    if (erreurLignes) throw erreurLignes;

    // Récupérer la facture complète
    const { data: factureComplete } = await supabase
      .from('factures')
      .select('*, clients(*), lignes_facture(*)')
      .eq('id', facture.id)
      .single();

    res.status(201).json({ message: 'Facture créée avec succès', facture: factureComplete });
  } catch (err) {
    console.error('Erreur créer facture:', err);
    res.status(500).json({ erreur: 'Erreur lors de la création de la facture' });
  }
};

// PUT /api/factures/:id
const modifierFacture = async (req, res) => {
  const { lignes, dateEmission, dateEcheance, notes, conditionsPaiement, mentionsLegales, statut } = req.body;

  try {
    // Vérifier que la facture existe et appartient à l'utilisateur
    const { data: factureExistante } = await supabase
      .from('factures')
      .select('id, statut')
      .eq('id', req.params.id)
      .eq('utilisateur_id', req.utilisateur.id)
      .single();

    if (!factureExistante) {
      return res.status(404).json({ erreur: 'Facture introuvable' });
    }

    if (factureExistante.statut === 'payee') {
      return res.status(400).json({ erreur: 'Impossible de modifier une facture payée' });
    }

    const miseAJour = {
      date_emission: dateEmission,
      date_echeance: dateEcheance,
      notes,
      conditions_paiement: conditionsPaiement,
      mentions_legales: mentionsLegales,
      mis_a_jour_le: new Date().toISOString()
    };

    if (statut) miseAJour.statut = statut;

    if (lignes && lignes.length > 0) {
      const { lignes: lignesCalculees, total_ht, total_tva, total_ttc } = calculerMontants(lignes);
      miseAJour.total_ht = total_ht;
      miseAJour.total_tva = total_tva;
      miseAJour.total_ttc = total_ttc;

      // Supprimer les anciennes lignes et réinsérer
      await supabase.from('lignes_facture').delete().eq('facture_id', req.params.id);

      const lignesAAjouter = lignesCalculees.map((ligne, index) => ({
        facture_id: req.params.id,
        utilisateur_id: req.utilisateur.id,
        ordre: index + 1,
        description: ligne.description,
        quantite: ligne.quantite,
        unite: ligne.unite || 'unité',
        prix_unitaire: ligne.prix_unitaire,
        taux_tva: ligne.taux_tva || 20,
        remise: ligne.remise || 0,
        montant_ht: ligne.montant_ht,
        montant_tva: ligne.montant_tva,
        montant_ttc: ligne.montant_ttc
      }));

      await supabase.from('lignes_facture').insert(lignesAAjouter);
    }

    const { data, error } = await supabase
      .from('factures')
      .update(miseAJour)
      .eq('id', req.params.id)
      .eq('utilisateur_id', req.utilisateur.id)
      .select('*, clients(*), lignes_facture(*)')
      .single();

    if (error) throw error;

    res.json({ message: 'Facture mise à jour', facture: data });
  } catch (err) {
    console.error('Erreur modifier facture:', err);
    res.status(500).json({ erreur: 'Erreur lors de la mise à jour de la facture' });
  }
};

// DELETE /api/factures/:id
const supprimerFacture = async (req, res) => {
  try {
    const { data: facture } = await supabase
      .from('factures')
      .select('statut')
      .eq('id', req.params.id)
      .eq('utilisateur_id', req.utilisateur.id)
      .single();

    if (!facture) {
      return res.status(404).json({ erreur: 'Facture introuvable' });
    }

    if (facture.statut === 'payee') {
      return res.status(400).json({ erreur: 'Impossible de supprimer une facture payée' });
    }

    // Les lignes sont supprimées en cascade (ON DELETE CASCADE dans le schéma SQL)
    const { error } = await supabase
      .from('factures')
      .delete()
      .eq('id', req.params.id)
      .eq('utilisateur_id', req.utilisateur.id);

    if (error) throw error;

    res.json({ message: 'Facture supprimée avec succès' });
  } catch (err) {
    console.error('Erreur supprimer facture:', err);
    res.status(500).json({ erreur: 'Erreur lors de la suppression de la facture' });
  }
};

// PATCH /api/factures/:id/statut
const changerStatut = async (req, res) => {
  const { statut } = req.body;
  const statutsValides = ['brouillon', 'envoyee', 'payee', 'en_retard', 'annulee'];

  if (!statutsValides.includes(statut)) {
    return res.status(400).json({ erreur: `Statut invalide. Valeurs possibles : ${statutsValides.join(', ')}` });
  }

  try {
    const miseAJour = { statut, mis_a_jour_le: new Date().toISOString() };
    if (statut === 'payee') miseAJour.date_paiement = new Date().toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('factures')
      .update(miseAJour)
      .eq('id', req.params.id)
      .eq('utilisateur_id', req.utilisateur.id)
      .select()
      .single();

    if (error || !data) return res.status(404).json({ erreur: 'Facture introuvable' });

    res.json({ message: `Facture marquée comme "${statut}"`, facture: data });
  } catch (err) {
    console.error('Erreur changer statut:', err);
    res.status(500).json({ erreur: 'Erreur lors du changement de statut' });
  }
};

// GET /api/factures/tableau-de-bord
const tableauDeBord = async (req, res) => {
  try {
    const { data: factures, error } = await supabase
      .from('factures')
      .select('statut, total_ttc, date_echeance, cree_le')
      .eq('utilisateur_id', req.utilisateur.id);

    if (error) throw error;

    const maintenant = new Date();
    const debutMois = new Date(maintenant.getFullYear(), maintenant.getMonth(), 1);

    const stats = {
      totalFactures: factures.length,
      chiffreAffaireMois: factures
        .filter(f => f.statut === 'payee' && new Date(f.date_paiement) >= debutMois)
        .reduce((s, f) => s + parseFloat(f.total_ttc || 0), 0),
      montantEnAttente: factures
        .filter(f => f.statut === 'envoyee')
        .reduce((s, f) => s + parseFloat(f.total_ttc || 0), 0),
      montantEnRetard: factures
        .filter(f => f.statut === 'en_retard')
        .reduce((s, f) => s + parseFloat(f.total_ttc || 0), 0),
      facturesParStatut: {
        brouillon: factures.filter(f => f.statut === 'brouillon').length,
        envoyee: factures.filter(f => f.statut === 'envoyee').length,
        payee: factures.filter(f => f.statut === 'payee').length,
        en_retard: factures.filter(f => f.statut === 'en_retard').length,
        annulee: factures.filter(f => f.statut === 'annulee').length
      }
    };

    res.json({ statistiques: stats });
  } catch (err) {
    console.error('Erreur tableau de bord:', err);
    res.status(500).json({ erreur: 'Erreur lors du calcul des statistiques' });
  }
};

module.exports = {
  listerFactures,
  obtenirFacture,
  creerFacture,
  modifierFacture,
  supprimerFacture,
  changerStatut,
  tableauDeBord
};
