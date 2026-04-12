# Facturo — SaaS de Facturation

Application de facturation complète pour les PME et freelances français.

## Fonctionnalités

- **Authentification** JWT sécurisée (inscription, connexion, gestion du profil)
- **Clients** : CRUD complet avec statistiques par client
- **Factures** : création, modification, suivi des statuts, numérotation automatique `FAC-2026-001`
- **Calcul automatique** HT / TVA / TTC par ligne de facture
- **IA Claude** : génération d'emails de relance + analyse de risque client
- **Abonnements Stripe** : plans Starter (9€), Pro (19€), Business (39€)
- **Base de données** Supabase (PostgreSQL) avec Row Level Security

---

## Prérequis

- Node.js 18+
- Un compte [Supabase](https://supabase.com)
- Un compte [Stripe](https://stripe.com)
- Une clé API [Anthropic](https://console.anthropic.com)

---

## Installation

### 1. Cloner le projet et installer les dépendances

```bash
cd facturo/backend
npm install
```

### 2. Configurer les variables d'environnement

```bash
cp .env.example .env
```

Remplissez chaque variable dans `.env` :

| Variable | Description |
|---|---|
| `PORT` | Port du serveur (défaut : 3000) |
| `JWT_SECRET` | Clé secrète JWT (min. 32 caractères aléatoires) |
| `JWT_EXPIRES_IN` | Durée de validité du token (ex. `7d`) |
| `SUPABASE_URL` | URL de votre projet Supabase |
| `SUPABASE_SERVICE_KEY` | Clé `service_role` Supabase (pas la clé `anon`) |
| `ANTHROPIC_API_KEY` | Clé API Anthropic Claude |
| `STRIPE_SECRET_KEY` | Clé secrète Stripe |
| `STRIPE_WEBHOOK_SECRET` | Secret du webhook Stripe |
| `STRIPE_PRICE_STARTER` | ID du prix Stripe pour le plan Starter |
| `STRIPE_PRICE_PRO` | ID du prix Stripe pour le plan Pro |
| `STRIPE_PRICE_BUSINESS` | ID du prix Stripe pour le plan Business |
| `FRONTEND_URL` | URL du frontend (pour CORS) |

### 3. Initialiser la base de données

Dans le **SQL Editor** de votre tableau de bord Supabase, exécutez le contenu de :

```
database/schema.sql
```

### 4. Configurer Stripe

#### Créer les produits et prix

Dans votre tableau de bord Stripe, créez 3 produits avec des prix récurrents mensuels :

| Plan | Prix mensuel | Récupérez le `price_id` |
|---|---|---|
| Starter | 9,00 € | `STRIPE_PRICE_STARTER` |
| Pro | 19,00 € | `STRIPE_PRICE_PRO` |
| Business | 39,00 € | `STRIPE_PRICE_BUSINESS` |

#### Configurer le webhook Stripe

1. Dans Stripe → Développeurs → Webhooks, ajoutez un endpoint :
   ```
   https://votre-domaine.com/api/stripe/webhook
   ```
2. Sélectionnez les événements :
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
3. Copiez le **Signing secret** dans `STRIPE_WEBHOOK_SECRET`

Pour tester en local :
```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

---

## Démarrage

```bash
# Développement (avec rechargement automatique)
npm run dev

# Production
npm start
```

L'API est disponible sur `http://localhost:3000`.

---

## Endpoints API

### Authentification

| Méthode | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/inscription` | Créer un compte |
| `POST` | `/api/auth/connexion` | Se connecter |
| `GET` | `/api/auth/moi` | Profil de l'utilisateur connecté |
| `PUT` | `/api/auth/profil` | Mettre à jour le profil |
| `POST` | `/api/auth/changer-mot-de-passe` | Changer le mot de passe |

### Clients

| Méthode | Endpoint | Description |
|---|---|---|
| `GET` | `/api/clients` | Lister les clients (pagination, recherche) |
| `GET` | `/api/clients/:id` | Détail d'un client + statistiques |
| `POST` | `/api/clients` | Créer un client |
| `PUT` | `/api/clients/:id` | Modifier un client |
| `DELETE` | `/api/clients/:id` | Supprimer un client |

### Factures

| Méthode | Endpoint | Description |
|---|---|---|
| `GET` | `/api/factures/tableau-de-bord` | Statistiques globales |
| `GET` | `/api/factures` | Lister les factures (filtres, pagination) |
| `GET` | `/api/factures/:id` | Détail d'une facture + lignes |
| `POST` | `/api/factures` | Créer une facture |
| `PUT` | `/api/factures/:id` | Modifier une facture |
| `DELETE` | `/api/factures/:id` | Supprimer une facture |
| `PATCH` | `/api/factures/:id/statut` | Changer le statut |

**Statuts possibles** : `brouillon` → `envoyee` → `payee` / `en_retard` / `annulee`

### Intelligence Artificielle (Claude)

| Méthode | Endpoint | Description |
|---|---|---|
| `POST` | `/api/ia/relance-email` | Générer un email de relance |
| `POST` | `/api/ia/analyse-risque-client` | Analyser le risque d'un client |

**Corps de `/api/ia/relance-email`** :
```json
{
  "factureId": "uuid-de-la-facture",
  "tonalite": "professionnel"
}
```
Valeurs de `tonalite` : `amical`, `professionnel`, `ferme`

**Corps de `/api/ia/analyse-risque-client`** :
```json
{
  "clientId": "uuid-du-client"
}
```

### Stripe / Abonnements

| Méthode | Endpoint | Description |
|---|---|---|
| `GET` | `/api/stripe/plans` | Lister les plans disponibles |
| `GET` | `/api/stripe/abonnement` | Abonnement actuel de l'utilisateur |
| `POST` | `/api/stripe/creer-session-abonnement` | Créer une session de paiement Checkout |
| `POST` | `/api/stripe/portail-client` | Accéder au portail de facturation Stripe |
| `POST` | `/api/stripe/webhook` | Webhook Stripe (usage interne) |

---

## Exemples de requêtes

### Inscription
```bash
curl -X POST http://localhost:3000/api/auth/inscription \
  -H "Content-Type: application/json" \
  -d '{
    "nom": "Marie Martin",
    "email": "marie@example.com",
    "motDePasse": "MonMotDePasse1",
    "nomEntreprise": "Martin Conseil"
  }'
```

### Créer une facture
```bash
curl -X POST http://localhost:3000/api/factures \
  -H "Authorization: Bearer VOTRE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "uuid-client",
    "dateEmission": "2026-04-12",
    "dateEcheance": "2026-05-12",
    "lignes": [
      {
        "description": "Développement site web",
        "quantite": 5,
        "unite": "jours",
        "prix_unitaire": 600,
        "taux_tva": 20,
        "remise": 0
      }
    ],
    "conditionsPaiement": "Paiement à 30 jours",
    "notes": "Merci pour votre confiance."
  }'
```

### Email de relance avec Claude
```bash
curl -X POST http://localhost:3000/api/ia/relance-email \
  -H "Authorization: Bearer VOTRE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "factureId": "uuid-facture",
    "tonalite": "ferme"
  }'
```

---

## Déploiement en production

### Railway / Render / Fly.io

1. Poussez le code sur GitHub
2. Connectez votre repo au service de déploiement
3. Définissez toutes les variables d'environnement du `.env.example`
4. Configurez la commande de démarrage : `npm start`
5. Mettez à jour l'URL du webhook Stripe avec votre domaine de production

### Variables de production importantes

```env
NODE_ENV=production
JWT_SECRET=<généré avec: openssl rand -base64 64>
STRIPE_SECRET_KEY=sk_live_...   # Clé live, pas test
```

---

## Limites par plan

| Fonctionnalité | Starter (9€) | Pro (19€) | Business (39€) |
|---|---|---|---|
| Clients | 10 | 50 | Illimité |
| Factures | 20 | 100 | Illimité |
| IA (relances/analyses) | 20/h | 20/h | 20/h |

---

## Sécurité

- Mots de passe hashés avec **bcrypt** (coût 12)
- Tokens JWT avec expiration configurable
- **Helmet** pour les headers HTTP
- **Rate limiting** global (100 req/15min) et IA (20 req/heure)
- Row Level Security activé sur Supabase
- Variables d'environnement pour toutes les clés sensibles
- Validation des entrées avec **express-validator**
