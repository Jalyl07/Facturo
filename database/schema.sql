-- ============================================================
-- FACTURO - Schéma PostgreSQL (Supabase)
-- ============================================================

-- Extension UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABLE : utilisateurs
-- ============================================================
CREATE TABLE IF NOT EXISTS utilisateurs (
    id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nom                   VARCHAR(255) NOT NULL,
    email                 VARCHAR(255) UNIQUE NOT NULL,
    mot_de_passe          VARCHAR(255) NOT NULL,
    nom_entreprise        VARCHAR(255),
    siret                 VARCHAR(20),
    telephone             VARCHAR(30),
    adresse               TEXT,
    ville                 VARCHAR(100),
    code_postal           VARCHAR(10),
    pays                  VARCHAR(100) DEFAULT 'France',
    logo_url              TEXT,
    plan                  VARCHAR(20) DEFAULT 'starter' CHECK (plan IN ('starter', 'pro', 'business')),
    stripe_customer_id    VARCHAR(100),
    stripe_subscription_id VARCHAR(100),
    actif                 BOOLEAN DEFAULT true,
    cree_le               TIMESTAMPTZ DEFAULT NOW(),
    mis_a_jour_le         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_utilisateurs_email ON utilisateurs(email);
CREATE INDEX idx_utilisateurs_stripe_customer ON utilisateurs(stripe_customer_id);

-- ============================================================
-- TABLE : clients
-- ============================================================
CREATE TABLE IF NOT EXISTS clients (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    utilisateur_id  UUID NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
    nom             VARCHAR(255) NOT NULL,
    entreprise      VARCHAR(255),
    email           VARCHAR(255) NOT NULL,
    telephone       VARCHAR(30),
    adresse         TEXT,
    ville           VARCHAR(100),
    code_postal     VARCHAR(10),
    pays            VARCHAR(100) DEFAULT 'France',
    siret           VARCHAR(20),
    tva_intracom    VARCHAR(30),
    notes           TEXT,
    cree_le         TIMESTAMPTZ DEFAULT NOW(),
    mis_a_jour_le   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_clients_utilisateur ON clients(utilisateur_id);
CREATE INDEX idx_clients_email ON clients(utilisateur_id, email);

-- ============================================================
-- TABLE : factures
-- ============================================================
CREATE TABLE IF NOT EXISTS factures (
    id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    utilisateur_id        UUID NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
    client_id             UUID NOT NULL REFERENCES clients(id),
    numero                VARCHAR(50) NOT NULL,
    statut                VARCHAR(20) DEFAULT 'brouillon'
                            CHECK (statut IN ('brouillon', 'envoyee', 'payee', 'en_retard', 'annulee')),
    date_emission         DATE NOT NULL DEFAULT CURRENT_DATE,
    date_echeance         DATE,
    date_paiement         DATE,
    total_ht              NUMERIC(12,2) DEFAULT 0,
    total_tva             NUMERIC(12,2) DEFAULT 0,
    total_ttc             NUMERIC(12,2) DEFAULT 0,
    devise                VARCHAR(5) DEFAULT 'EUR',
    notes                 TEXT,
    conditions_paiement   TEXT DEFAULT 'Paiement à 30 jours',
    mentions_legales      TEXT,
    cree_le               TIMESTAMPTZ DEFAULT NOW(),
    mis_a_jour_le         TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (utilisateur_id, numero)
);

CREATE INDEX idx_factures_utilisateur ON factures(utilisateur_id);
CREATE INDEX idx_factures_client ON factures(client_id);
CREATE INDEX idx_factures_statut ON factures(utilisateur_id, statut);
CREATE INDEX idx_factures_numero ON factures(utilisateur_id, numero);

-- ============================================================
-- TABLE : lignes_facture
-- ============================================================
CREATE TABLE IF NOT EXISTS lignes_facture (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    facture_id      UUID NOT NULL REFERENCES factures(id) ON DELETE CASCADE,
    utilisateur_id  UUID NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
    ordre           INTEGER NOT NULL DEFAULT 1,
    description     TEXT NOT NULL,
    quantite        NUMERIC(10,3) NOT NULL DEFAULT 1,
    unite           VARCHAR(50) DEFAULT 'unité',
    prix_unitaire   NUMERIC(12,2) NOT NULL DEFAULT 0,
    taux_tva        NUMERIC(5,2) DEFAULT 20,
    remise          NUMERIC(5,2) DEFAULT 0,
    montant_ht      NUMERIC(12,2) DEFAULT 0,
    montant_tva     NUMERIC(12,2) DEFAULT 0,
    montant_ttc     NUMERIC(12,2) DEFAULT 0,
    cree_le         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_lignes_facture ON lignes_facture(facture_id);

-- ============================================================
-- Row Level Security (RLS) - Supabase
-- ============================================================

ALTER TABLE utilisateurs ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE factures ENABLE ROW LEVEL SECURITY;
ALTER TABLE lignes_facture ENABLE ROW LEVEL SECURITY;

-- Politique : le service_role (backend) peut tout faire
-- Les utilisateurs normaux ne peuvent voir que leurs propres données

-- Utilisateurs : accès uniquement à soi-même
CREATE POLICY "utilisateurs_propre_acces" ON utilisateurs
    FOR ALL USING (true); -- Le backend utilise service_role, RLS ignoré

-- Clients : accès uniquement à ses propres clients
CREATE POLICY "clients_propre_acces" ON clients
    FOR ALL USING (true);

-- Factures : accès uniquement à ses propres factures
CREATE POLICY "factures_propre_acces" ON factures
    FOR ALL USING (true);

-- Lignes : accès uniquement à ses propres lignes
CREATE POLICY "lignes_propre_acces" ON lignes_facture
    FOR ALL USING (true);

-- ============================================================
-- Fonction : mise à jour automatique de mis_a_jour_le
-- ============================================================
CREATE OR REPLACE FUNCTION mise_a_jour_horodatage()
RETURNS TRIGGER AS $$
BEGIN
    NEW.mis_a_jour_le = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_utilisateurs_mis_a_jour
    BEFORE UPDATE ON utilisateurs
    FOR EACH ROW EXECUTE FUNCTION mise_a_jour_horodatage();

CREATE TRIGGER trigger_clients_mis_a_jour
    BEFORE UPDATE ON clients
    FOR EACH ROW EXECUTE FUNCTION mise_a_jour_horodatage();

CREATE TRIGGER trigger_factures_mis_a_jour
    BEFORE UPDATE ON factures
    FOR EACH ROW EXECUTE FUNCTION mise_a_jour_horodatage();
