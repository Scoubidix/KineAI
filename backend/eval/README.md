# Eval — extraction du bilan

Jeu d'évaluation manuel de `services/bilanExtractionService.extractFromText`, contre le
**vrai provider IA** (`GENERATION_PROVIDER` de `backend/.env`, via `services/llmService.js`).
Ce n'est pas un test Jest : c'est non déterministe, ça coûte des appels réseau au provider,
et ça n'entre donc jamais dans `npm test` ni dans une CI.

## ⚠️ Coût

Chaque cas déclenche **un appel réel au provider** (OpenAI ou Mistral selon `.env`).
Lancer les 13 cas d'un coup coûte 13 appels (quelques centimes, ~30-60 s). Ne pas lancer
la suite entière sans le vouloir — utiliser `--only` pour tester un seul cas.

## Lancer

```bash
cd backend
npm run eval:extraction                    # les 13 cas
npm run eval:extraction -- --only note-05  # un seul cas
npm run eval:extraction -- --json out.json # + dump JSON des résultats
```

Prérequis : `backend/.env` renseigné (clé API du provider actif), `data/bilanSeed.json`
présent et lisible (catalogue des champs). Aucun accès DB, aucun serveur à démarrer.

## Ajouter un cas

Éditer `backend/eval/extraction/cases.json`, ajouter un objet :

```json
{
  "id": "note-11",
  "title": "courte description",
  "motif": null,
  "notes": "texte brut de la note ou transcript, copié tel quel (fautes incluses)",
  "expect": ["eva_repos=4", "test_laseuge:D=false"],
  "forbid": ["test_lachman"],
  "forbidValues": [92],
  "customContains": ["monopodal"]
}
```

- `expect` : liste de `clé[:D|G]=valeur`. La clé est la clé canonique du champ (voir
  `data/bilanSeed.json`). `:D` / `:G` précise le côté pour les champs latéralisés. La valeur
  est parsée en nombre si elle ressemble à un nombre, en booléen si `true`/`false`, sinon
  comparée comme texte (normalisée — accents/casse ignorés) ; préfixer par `~` pour une
  comparaison par inclusion plutôt qu'égalité stricte (utile pour une valeur libre du type
  « L3 » ou « 500 m »).
- `forbid` : clés canoniques qui ne doivent produire **aucun** candidat (pièges — ex. un
  test explicitement « non testé » ne doit rien extraire).
- `forbidValues` : valeurs numériques qui ne doivent apparaître sur **aucun** candidat
  canonique NUMERIC (pièges de chiffres de contexte — âge, poids, dates, délais — à ne pas
  confondre avec une mesure).
- `customContains` : au moins une mesure libre (candidat `kind: "custom"`) dont le libellé
  ou la valeur contient ce texte (comparaison normalisée).

Les textes des 13 cas actuels viennent tels quels de
`docs/superpowers/tests/2026-09-08-jeu-de-test-extraction.md` (10 notes + 3 transcripts) —
s'y référer pour le détail des attentes et des pièges de chaque cas.

## Lire la sortie

Pour chaque cas :

```
▶ note-05 — cheville aiguë, style télégraphique … rappel 89 % · 1 interdit(s) · 0 extra(s) · 0 écarté(s)
   manquant   test_kleiger:G
   INTERDIT   appui_monopodal_secondes
   custom absent : monopodal
```

- **rappel** : proportion des mesures attendues (`expect`) effectivement extraites avec la
  bonne valeur (comptent en échec : manquant + valeur fausse).
- **interdit(s)** : nombre total de violations `forbid` + `forbidValues` + `customContains`
  manquant — le harnais **sort en code 1** si ce total est > 0 sur l'ensemble des cas lancés.
- **extra(s)** : candidats canoniques non listés dans `expect` (pas forcément une erreur —
  peut être une mesure légitime que le cas n'avait pas anticipée ; à relire au cas par cas).
- **écarté(s)** (`rejected`) : candidats proposés par le modèle mais rejetés en aval (ex.
  faute de citation exacte dans le texte source) — un nombre élevé sur les transcriptions
  indique que le modèle reformule au lieu de citer verbatim.
- lignes de détail : `manquant` (clé attendue absente), `valeur` (clé trouvée mais valeur
  différente), `INTERDIT` (violation `forbid`/`forbidValues`), `custom absent` (violation
  `customContains`), `extra` (candidat canonique non attendu), `libre` (candidats `custom`
  produits, pour relecture manuelle).
- en fin de run : rappel moyen et total d'interdits sur tous les cas lancés.
