# Guide de génération de `bilanSeed.json`

Ce document est le **contrat** à respecter pour produire le fichier `bilanSeed.json`.
Il est **auto-suffisant** : tu n'as pas besoin d'accéder au code de l'application.

Le fichier généré alimente deux catalogues d'une application pour kinésithérapeutes :

- **Les champs de bilan** (`fields`) = les tests et mesures cliniques réutilisables
  (ex. « EVA au repos », « Flexion active de l'épaule », « Testing quadriceps »).
- **Les templates de bilan** (`templates`) = des modèles pré-composés qui regroupent une
  liste ordonnée de champs, pour aider le kiné à démarrer un bilan (ex. « Épaule — Bilan
  initial » qui contient une dizaine de tests d'épaule).

À chaque déploiement, l'application lit ce JSON et **remplace intégralement** les deux
catalogues par son contenu (voir « Règle d'or » plus bas). Le JSON est donc **la source de
vérité unique**.

---

## 1. Structure globale du fichier

```jsonc
{
  "version": 1,          // entier ≥ 1 — À INCRÉMENTER à chaque nouvelle livraison du fichier
  "fields": [ ... ],     // liste des tests/mesures
  "templates": [ ... ]   // liste des templates (modèles de bilan)
}
```

- `version` : commence à `1`. **Chaque fois** que tu livres une nouvelle version du fichier,
  incrémente ce nombre (1 → 2 → 3…). C'est ce qui déclenche la ré-application côté serveur.
  Si tu ne l'incrémentes pas, le serveur ignore le nouveau fichier.

---

## 2. Un champ (`fields[]`)

```jsonc
{
  "key": "eva_repos",          // OBLIGATOIRE — identifiant technique permanent
  "label": "EVA au repos",     // OBLIGATOIRE — libellé affiché au kiné
  "type": "NUMERIC",           // OBLIGATOIRE — NUMERIC | BOOLEAN | TEXT | ENUM
  "category": "Douleur",       // OBLIGATOIRE — regroupement d'affichage
  "order": 1,                  // OBLIGATOIRE — ordre dans la catégorie (entier)
  "unit": "/10",               // selon le type (voir ci-dessous)
  "rangeMin": 0,               // selon le type
  "rangeMax": 10,              // selon le type
  "options": ["...", "..."],   // selon le type
  "isActive": false            // OPTIONNEL — défaut true ; false = champ masqué au kiné
}
```

### Règles par champ

| Champ | Contrainte |
|---|---|
| `key` | `snake_case` strict : minuscules, chiffres, underscores. Regex `^[a-z][a-z0-9_]*$`. **Unique** dans tout le fichier. Max 80 caractères. |
| `label` | Non vide. Max 200 caractères. |
| `type` | Exactement l'une de ces 4 valeurs : `NUMERIC`, `BOOLEAN`, `TEXT`, `ENUM`. |
| `category` | Non vide. Max 80 caractères. Sert à regrouper les champs à l'écran (ex. « Douleur », « Amplitudes », « Force »). |
| `order` | Entier ≥ 0. Ordre d'affichage **à l'intérieur** de la catégorie. |
| `isActive` | Optionnel, booléen. Défaut `true`. Mets `false` pour livrer un champ **désactivé** (masqué au kiné mais conservé — sa `key` reste valide). |

### Détails selon `type`

- **`NUMERIC`** — valeur numérique (ex. une amplitude, une EVA).
  - `unit` : *optionnel* — l'unité affichée (ex. `"/10"`, `"°"`, `"cm"`, `"kg"`).
  - `rangeMin`, `rangeMax` : *optionnels* — bornes indicatives (nombres).
- **`BOOLEAN`** — oui/non, positif/négatif (ex. un test de Lasègue).
  - Aucun champ supplémentaire.
- **`TEXT`** — observation libre en texte.
  - Aucun champ supplémentaire.
- **`ENUM`** — choix dans une liste fermée (ex. testing musculaire).
  - `options` : **OBLIGATOIRE** — tableau **non vide** de chaînes (ex. `["0/5","1/5","2/5","3/5","4/5","5/5"]`).

> N'ajoute `unit`/`rangeMin`/`rangeMax` que pour du `NUMERIC`, et `options` **que** pour de
> l'`ENUM`. Ne mets pas de champs superflus.

---

## 3. Un template (`templates[]`)

```jsonc
{
  "name": "Épaule — Bilan initial",       // OBLIGATOIRE — nom affiché
  "description": "Bilan initial épaule",   // optionnel
  "category": "Épaule",                    // OBLIGATOIRE — regroupement
  "items": [                               // OBLIGATOIRE — 1 à 100 items, DANS L'ORDRE voulu
    { "kind": "canonical", "key": "eva_repos" },
    { "kind": "canonical", "key": "flexion_active_epaule" },
    { "kind": "custom", "label": "Test de Neer" }
  ]
}
```

### Règles par template

| Champ | Contrainte |
|---|---|
| `name` | Non vide. Max 150 caractères. |
| `description` | Optionnel. Max 500 caractères. |
| `category` | Non vide. Max 80 caractères (ex. « Épaule », « Rachis lombaire », « Genou »). |
| `items` | Tableau de 1 à 100 éléments, **dans l'ordre d'affichage souhaité**. |

### Les deux formes d'`items`

- **`{ "kind": "canonical", "key": "<key>" }`** — référence un champ défini dans `fields`.
  La `key` **doit exister** dans la section `fields` du même fichier, sinon le fichier entier
  est rejeté.
- **`{ "kind": "custom", "label": "<texte>" }`** — une mesure libre propre au template, qui
  n'existe pas comme champ réutilisable. `label` non vide.

> Privilégie les items `canonical` (réutilisables, structurés). Réserve `custom` aux mesures
> vraiment spécifiques à un seul template.

---

## 4. RÈGLE D'OR — les `key` sont **permanentes**

L'application stocke chaque mesure d'un bilan patient en référençant la `key` du champ.
Si une `key` disparaît ou change, les bilans déjà enregistrés qui l'utilisaient s'affichent
en « champ inconnu » (la valeur est conservée mais le libellé est perdu).

**À partir de la version 1 livrée, d'une version à l'autre :**

- ✅ Tu peux **ajouter** de nouveaux champs (nouvelles keys).
- ✅ Tu peux modifier librement `label`, `unit`, `options`, `rangeMin/Max`, `category`,
  `order` d'un champ existant.
- ❌ Tu ne dois **JAMAIS renommer** une `key` existante.
- ❌ Tu ne dois **JAMAIS supprimer** une `key` déjà livrée. Pour « retirer » un test de
  l'usage, laisse simplement son champ dans le fichier (ne casse pas sa key).

> Choisis donc des `key` propres et durables dès le départ. Une bonne key est courte,
> explicite, sans accent : `flexion_active_epaule`, `douleur_nocturne`, `perimetre_cuisse`.

---

## 4bis. Keys DÉJÀ en production — à préserver telles quelles

Le fichier de départ (`bilanSeed.json`, version 1) contient **45 champs déjà utilisés en
production**. Leurs `key` sont **gravées dans le marbre** : tu construis **par-dessus**
(ajouts uniquement), tu ne renommes ni ne supprimes **aucune** de ces keys.

> ⚠️ **Deux keys contiennent une coquille historique. NE PAS les corriger** — les corriger
> casserait les bilans patients existants. Le *libellé* affiché est correct, seule la key est
> figée :
> - `ij_dynalmo` (et non `ij_dynamo`)
> - `test_laseuge` (et non `test_lasegue`)

Liste complète des 45 keys existantes, par catégorie :

- **Douleur** : `eva_repos`, `eva_effort`, `eva_nuit`
- **Amplitudes** : `flexion_genou`, `extension_genou`
- **Epaule** (amplitudes) : `flexion_epaule`, `extension_epaule`, `abduction_epaule`*,
  `adduction_epaule`*, `rotation_externe_1`*
- **Epaule** (tests) : `test_neer`, `test_jobe`, `test_patte`, `test_gerber`, `test_speed`,
  `test_yergason`, `test_hawkins_kennedy`, `test_yocum`, `test_adduction_forcee`, `test_crank`,
  `test_apprehension_posterieure`, `test_apprehension_anterieure`, `test_recentrage`,
  `load_and_shift_test`
- **Force** : `quad_dynamo`, `ij_dynalmo`
- **Genou** : `test_provocation_valgus_genou`, `test_provocation_varus_genou`, `test_lachman`,
  `test_ressaut_rotatoire`, `tiroir_anterieur_genou`, `tiroir_posterieur_genou`, `test_godfrey`,
  `test_muller`, `palpation_interligne_articulaire_genou`, `test_apley`, `test_thessaly`,
  `test_mcmurray`, `test_apprehension_smilie`, `test_noble`
- **Mobilité** : `mobilite_rotule`
- **Oedème** : `circonference_susrotulienne`
- **Poignet/Main** : `test_phalen`, `signe_tinel`
- **Rachis/Bassin** : `test_laseuge`

*(\*) `abduction_epaule`, `adduction_epaule`, `rotation_externe_1` sont livrés `isActive: false`
(désactivés en prod). Garde-les désactivés (ne pas les réactiver sans raison), mais conserve
leurs keys.*

Réutilise ces catégories existantes (`Douleur`, `Amplitudes`, `Epaule`, `Force`, `Genou`,
`Mobilité`, `Oedème`, `Poignet/Main`, `Rachis/Bassin`) pour rester cohérent — note que
`Epaule` est écrit **sans accent** en base, respecte cette orthographe pour ne pas créer une
2ᵉ catégorie en double.

---

## 5. Bon à savoir pour bien générer

- **Couvre les grandes régions anatomiques** avec des champs réutilisables (rachis cervical/
  lombaire, épaule, coude, poignet/main, hanche, genou, cheville/pied), plus des catégories
  transversales : Douleur, Amplitudes articulaires, Force / testing, Tests spécifiques,
  Fonctionnel, Neurologique.
- **Nomme les catégories de façon cohérente** : les champs d'une même catégorie sont
  regroupés à l'écran. Réutilise les mêmes noms de catégorie (« Douleur », « Amplitudes »…).
- **Réutilise les champs entre templates** via `canonical` plutôt que de recréer des `custom`.
- **`order`** : numérote les champs dans l'ordre logique de passation, catégorie par catégorie.
- **Vérifie avant de livrer** : chaque `key` de template `canonical` existe bien dans `fields`,
  toutes les keys sont uniques, les `ENUM` ont des `options`, et le JSON est valide.

---

## 6. Exemples légers (à étendre)

### Extrait `fields`

```json
[
  { "key": "eva_repos", "label": "EVA au repos", "type": "NUMERIC", "unit": "/10", "rangeMin": 0, "rangeMax": 10, "category": "Douleur", "order": 1 },
  { "key": "eva_effort", "label": "EVA à l'effort", "type": "NUMERIC", "unit": "/10", "rangeMin": 0, "rangeMax": 10, "category": "Douleur", "order": 2 },
  { "key": "douleur_nocturne", "label": "Douleur nocturne", "type": "BOOLEAN", "category": "Douleur", "order": 3 },
  { "key": "flexion_active_epaule", "label": "Flexion active épaule", "type": "NUMERIC", "unit": "°", "rangeMin": 0, "rangeMax": 180, "category": "Amplitudes", "order": 1 },
  { "key": "abduction_active_epaule", "label": "Abduction active épaule", "type": "NUMERIC", "unit": "°", "rangeMin": 0, "rangeMax": 180, "category": "Amplitudes", "order": 2 },
  { "key": "testing_deltoide", "label": "Testing deltoïde", "type": "ENUM", "options": ["0/5","1/5","2/5","3/5","4/5","5/5"], "category": "Force", "order": 1 },
  { "key": "observation_generale", "label": "Observation générale", "type": "TEXT", "category": "Fonctionnel", "order": 1 }
]
```

### Extrait `templates`

```json
[
  {
    "name": "Épaule — Bilan initial",
    "description": "Bilan initial pour pathologies d'épaule",
    "category": "Épaule",
    "items": [
      { "kind": "canonical", "key": "eva_repos" },
      { "kind": "canonical", "key": "eva_effort" },
      { "kind": "canonical", "key": "douleur_nocturne" },
      { "kind": "canonical", "key": "flexion_active_epaule" },
      { "kind": "canonical", "key": "abduction_active_epaule" },
      { "kind": "canonical", "key": "testing_deltoide" },
      { "kind": "custom", "label": "Test de Neer" },
      { "kind": "custom", "label": "Test de Hawkins" },
      { "kind": "canonical", "key": "observation_generale" }
    ]
  }
]
```

### Fichier complet minimal (structure attendue)

```json
{
  "version": 1,
  "fields": [
    { "key": "eva_repos", "label": "EVA au repos", "type": "NUMERIC", "unit": "/10", "rangeMin": 0, "rangeMax": 10, "category": "Douleur", "order": 1 }
  ],
  "templates": [
    {
      "name": "Exemple",
      "category": "Divers",
      "items": [ { "kind": "canonical", "key": "eva_repos" } ]
    }
  ]
}
```

---

## 7. Checklist finale avant livraison

- [ ] `version` présent, entier ≥ 1 (incrémenté si ce n'est pas la toute première livraison).
- [ ] **Les 45 keys existantes (section 4bis) sont toutes conservées à l'identique** — y compris `ij_dynalmo` et `test_laseuge` (coquilles figées, non corrigées).
- [ ] Toutes les `key` sont en `snake_case`, uniques, sans accent.
- [ ] Chaque champ a `key`, `label`, `type`, `category`, `order`.
- [ ] Chaque `ENUM` a un `options` non vide ; les `NUMERIC` portent leurs `unit`/bornes si utile.
- [ ] Chaque template a `name`, `category`, et un `items` de 1 à 100 éléments.
- [ ] Chaque item `canonical` pointe une `key` qui existe dans `fields`.
- [ ] Chaque item `custom` a un `label` non vide.
- [ ] Le JSON est syntaxiquement valide.
