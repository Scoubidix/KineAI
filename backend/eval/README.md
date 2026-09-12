# Eval — extraction du bilan

Jeu d'évaluation manuel de `services/bilanExtractionService.extractFromText`, contre le
**vrai provider IA** (`GENERATION_PROVIDER` de `backend/.env`, via `services/llmService.js`).
Ce n'est pas un test Jest : c'est non déterministe, ça coûte des appels réseau au provider,
et ça n'entre donc jamais dans `npm test` ni dans une CI.

⚠️ Corpus synthétique uniquement : ne jamais pointer le harnais sur de vraies notes patient — la
sortie (et `--json`) contient des extraits verbatim.

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

## Eval — dictée

Même principe que ci-dessus, mais sur les **transcriptions** produites par le pipeline ASR plutôt
que sur du texte saisi. Chaîne complète :

```
asr-worker/eval/gen_dictation.py   # génère l'audio des 5 dictées (edge-tts), variantes clean/cabinet
        ↓
asr-worker/eval/bench.py           # transcrit chaque fichier → asr-worker/eval/out/<nom>_<variante>.txt
        ↓
npm run eval:dictation             # (ce harnais) extrait depuis la transcription, compare à expect/forbid
```

Le harnais ne lit que `asr-worker/eval/out/` (déjà produit par `bench.py`) — il ne relance jamais le
worker ASR ni la synthèse audio. `backend/eval/dictation/cases.json` reprend les 5 dictées avec les
mêmes attentes (`expect`/`forbid`/`forbidValues`/`customContains`) que les cas `run.js` équivalents,
mais un `transcript` (chemin vers le fichier `_clean.txt`, relatif à la racine du dépôt) à la place
de `notes`. La logique d'évaluation (`runCase`, `printResult`, `summarize`) est partagée avec
`eval:extraction` via `backend/eval/extraction/lib.js`.

```bash
cd backend
npm run eval:dictation                        # 5 cas, variante clean (défaut)
npm run eval:dictation -- --variant cabinet    # variante cabinet (bruit de salle)
npm run eval:dictation -- --only dictee-03     # un seul cas
npm run eval:dictation -- --json out.json      # + dump JSON des résultats
npm run eval:dictation -- --correct            # passe de correction avant extraction, 1 appel de plus par cas
```

⚠️ Coût : comme `eval:extraction`, chaque cas déclenche un appel réel au provider — 5 appels par
variante (~0,05 €), le double avec `--correct` (10 appels : correction + extraction par cas).
Lancer une seule fois par variante, pas en boucle.

`--correct` fait passer chaque transcription par `services/dictationCorrectionService.correct`
(mode `dictation`, catalogue = même seed) avant l'extraction, et affiche pour chaque cas le nombre
d'opérations appliquées/ignorées ainsi que les « termes » (`TERMES`, même liste que le bench du
worker) retrouvés dans le texte avant et après correction — un comptage textuel simple (inclusion,
insensible à la casse), pas un score d'extraction.

Si un fichier `asr-worker/eval/out/dictee-0N_<variante>.txt` est absent, le cas correspondant est
signalé `ABSENT` et compte en erreur (rappel non calculé) — relancer `asr-worker/eval/bench.py`
pour régénérer les transcriptions.

## Eval — séance (dialogue kiné-patient)

Chaîne complète de la séance (plan 8b) : transcription (`asr-worker/eval/out/seance-0N_*.txt`,
dialogue à deux voix) → **passe de correction obligatoire**
(`services/dictationCorrectionService.correct`, mode `session`) → compte rendu en sept sections
(`services/sessionReportService.report`) → extraction (même logique partagée `runCase`/`printResult`/
`summarize` que `eval:extraction`/`eval:dictation`, sur les notes produites par le compte rendu).

Contrairement à `eval:dictation`, il n'y a pas de flag `--correct` ici : la correction fait partie
intégrante de la chaîne de séance (le compte rendu est toujours produit à partir du dialogue
corrigé), donc toujours appliquée.

```bash
cd backend
npm run eval:session                        # 5 cas, variante clean (défaut)
npm run eval:session -- --variant cabinet   # variante cabinet (bruit de salle)
npm run eval:session -- --only seance-03    # un seul cas
npm run eval:session -- --json out.json     # + dump JSON des résultats
```

⚠️ Coût : **3 appels réels au provider par cas** (correction, compte rendu, extraction), soit
15 appels pour les 5 cas d'une variante (quelques dizaines de centimes, run réel du 2026-09-12
avec `mistral-medium-3-5`). Aucun log de tokens/coût par appel n'est actuellement émis par
`dictationCorrectionService`, `sessionReportService` ni `bilanExtractionService` (seuls le nombre
d'opérations et de sections sont journalisés) : le coût par séance n'est donc pas mesurable
depuis les logs applicatifs, seulement estimable par le nombre d'appels × la taille du dialogue
(1500 à 2100 mots par séance ici).

Ce qui est mesuré, en plus du rappel d'extraction habituel :
- **sections attendues retrouvées** : sur les 7 sections du document (`anamnese`, `antecedents`,
  `examen`, `limitations`, `diagnostic`, `objectifs`, `traitement`), combien de celles que le cas
  attend (`expectSections`) sont effectivement non vides dans le compte rendu.
- **sections vidées par la garde** (`dropped`) : `sessionReportService.guardReport` vide toute
  section citant un nombre absent du dialogue (aucun nombre inventé toléré). C'est la mesure du
  « nombre inventé » pour ce harnais (la garde vide la section plutôt que de laisser passer un
  chiffre halluciné) — l'objectif est **zéro** sur la variante clean.

Seuils d'ouverture du bouton (spec §6), vérifiés en fin de run : sections attendues retrouvées
≥ 80 %, rappel d'extraction moyen ≥ 85 % (variante clean), 0 section vidée par la garde. Code de
sortie 1 si un seuil n'est pas atteint (en plus des cas déjà gérés par `summarize` : interdits,
cas en erreur).

Run de référence, détail par séance et conclusion : `asr-worker/README.md`, section
« Correction → Séance ».
