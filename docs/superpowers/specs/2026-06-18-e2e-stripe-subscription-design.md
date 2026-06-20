# Design — Tests e2e Playwright (flow abonnement Stripe)

Date : 2026-06-18
Statut : validé (brainstorming)

## Objectif

Mettre en place une suite de tests end-to-end Playwright, propres et rejouables,
dont le test central couvre le **flow d'abonnement Stripe complet** : du paywall
jusqu'à l'application du plan par le webhook. Le navigateur doit être **visible**
pendant l'exécution. Une fois la suite en place, elle servira de base pour la
maintenance du versioning Stripe.

## Décisions de cadrage

| Sujet | Décision |
|---|---|
| Environnement cible | **Local** (front `:3001`, backend `:3000`, DB Docker, Stripe `sk_test_`) |
| Webhook | `stripe listen --forward-to localhost:3000/webhook/stripe` (le webhook dashboard → staging reste un no-op inoffensif) |
| Périmètre flow | **Complet** : login → paywall → Checkout Stripe hébergé → carte test → retour success → webhook → assertion du plan actif |
| Auth | Compte de test **existant**, login one-shot via `storageState` (setup project) |
| Plan testé | **PRATIQUE** (29€) — évite la logique « 100 places » de PIONNIER |
| Cleanup | Restaurer `planType = EXPERT` à la fin (pas `null`) — c'est le compte dev de l'utilisateur |
| Env modifiées | **Aucune** env backend/front existante. Ajout d'un seul `frontend/.env.e2e` (gitignored) |

## Faits techniques vérifiés dans le code

- Front lancé sur `localhost:3001`. Backend `localhost:3000`.
- Backend local : `NODE_ENV=development`, `FRONTEND_URL=http://localhost:3001` (déjà correct).
- `POST /api/stripe/create-checkout` (`backend/routes/checkout.js`) :
  - redirige par défaut vers `${FRONTEND_URL}/dashboard/kine/upgrade/success?upgrade=success`
    (succès) et `${FRONTEND_URL}/dashboard/kine?upgrade=cancel` (annulation) ;
  - valide que `successUrl`/`cancelUrl` commencent par `FRONTEND_URL` (whitelist) ;
  - **si un abonnement actif existe** (`subscriptionStatus` ∈ ACTIVE/TRIALING/PAST_DUE),
    il fait un *changement de plan direct* sans page Checkout hébergée. → Le test doit
    donc **partir d'un état sans abonnement actif** pour déclencher le vrai Checkout.
- Webhook : `backend/routes/webhook/stripe.js` (signature + IP whitelist), applique `planType`.
- Déclenchement du checkout côté front : `PaywallModal.jsx` → `fetch POST /api/stripe/create-checkout`.

### Points à confirmer pendant l'implémentation (non bloquants)

- `successUrl` exact envoyé par `PaywallModal` (peut surcharger le défaut backend) →
  l'assertion d'atterrissage devra cibler l'URL réellement utilisée.
- Sélecteur précis du badge/plan pour l'assertion finale (UI via `useSubscription`).

## Standards retenus (tests propres & rejouables)

1. **Browser visible** : projet Playwright avec `headless: false` + `slowMo` (~300 ms).
   Script `npm run e2e:headed`. Le mode headless reste possible pour un futur CI.
2. **Auth via `storageState`** : un *setup project* (`auth.setup.ts`) se logue une fois
   avec le compte de test et sauvegarde `e2e/.auth/kine.json`. Tous les specs le réutilisent.
3. **Secrets hors du code** : `frontend/.env.e2e` (gitignored), chargé via `dotenv` dans
   `playwright.config.ts`. Contient `E2E_BASE_URL`, `E2E_KINE_EMAIL`, `E2E_KINE_PASSWORD`.
4. **Page Objects** : un POM par zone (`LoginPage`, `PaywallModal`, `StripeCheckoutPage`,
   éventuellement `DashboardPage`) → sélecteurs centralisés, maintenance facile.
5. **Isolation & cleanup** : endpoint backend **test-only** (voir ci-dessous) appelé en
   `beforeAll`/`afterAll` → suite rejouable à l'infini.

## Endpoint backend test-only

`POST /api/test/set-plan`

- **Garde** : renvoie 404 si `NODE_ENV === 'production'`. Actif uniquement en dev/local.
- **Body** : `{ planType: 'PRATIQUE' | 'EXPERT' | null, cancelStripeSub: boolean }`
- **Effet** :
  - si `cancelStripeSub` et un `subscriptionId` existe → annule l'abonnement Stripe test ;
  - met à jour `planType` (et les champs d'abonnement liés) du kiné de test en DB locale.
- **Auth** : protégé `authenticate` (le test est déjà loggé via storageState) — agit sur le kiné authentifié.

Usage dans les tests :
- `beforeAll` → `{ planType: null, cancelStripeSub: true }` (état propre, force le Checkout hébergé)
- `afterAll`  → `{ planType: 'EXPERT', cancelStripeSub: true }` (restaure le compte dev)

**Caveat assumé** : après le run, le compte est `EXPERT` en DB sans abonnement Stripe réel
derrière (test mode). Tant que `useSubscription` lit le plan en DB, l'expérience dev reste EXPERT.

## Arborescence

```
frontend/
  e2e/
    .auth/kine.json            # storageState (gitignored)
    fixtures/
      cards.ts                 # carte test 4242 + helpers
      reset.ts                 # helpers set-plan (beforeAll/afterAll)
    pages/
      LoginPage.ts
      PaywallModal.ts
      StripeCheckoutPage.ts
    tests/
      subscription.spec.ts     # flow Stripe complet
    auth.setup.ts              # login one-shot → storageState
  playwright.config.ts
  .env.e2e                     # gitignored
  .env.e2e.example             # template commité (sans secrets)
```

Ajouts `package.json` (frontend) :
- devDep `@playwright/test`, `dotenv`
- scripts : `e2e` (headless), `e2e:headed` (visible), `e2e:ui` (mode UI Playwright)
- `.gitignore` : `e2e/.auth/`, `.env.e2e`

## Le test central — `subscription.spec.ts`

1. `beforeAll` → `set-plan { planType: null, cancelStripeSub: true }`.
2. Auth chargée via storageState → arrivée sur le dashboard.
3. Déclencher le paywall (tenter de créer un programme au-delà de la limite) → clic « S'abonner » sur PRATIQUE.
4. Redirection vers Stripe Checkout hébergé (`checkout.stripe.com`).
5. Remplir la carte test `4242 4242 4242 4242`, date future, CVC, code postal → payer.
6. Stripe redirige vers la page success (`/dashboard/kine/upgrade/success?...`) → assertion d'atterrissage.
7. Webhook (via `stripe listen`) applique le plan → assertion : plan PRATIQUE actif (badge UI / `useSubscription`).
8. `afterAll` → `set-plan { planType: 'EXPERT', cancelStripeSub: true }`.

## Prérequis runtime (avant de lancer la suite)

3 terminaux + le listener Stripe :

```bash
docker compose up -d                                       # DB locale (:5433)
cd backend && node index.js                                # backend :3000 (NODE_ENV=development)
cd frontend && npm run dev                                 # front :3001
stripe listen --forward-to localhost:3000/webhook/stripe   # webhooks → local
```

Le `whsec_...` affiché par `stripe listen` doit correspondre au `STRIPE_ENDPOINT_SECRET`
du `.env` backend local.

## Hors périmètre (YAGNI)

- Pas de CI pour l'instant (mais structure compatible).
- Pas de 3DS/SCA (la carte 4242 n'en déclenche pas).
- Pas de test des changements de plan / portail client / réabonnement.
- Un seul flow : abonnement neuf vers PRATIQUE.

## Suite (hors de ce design)

Une fois la suite verte : maintenance du versioning Stripe (mise à jour de la version
d'API Stripe, vérification de non-régression du flow via cette e2e).
