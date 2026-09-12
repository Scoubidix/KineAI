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
  "customContains": ["monopodal"],
  "identity": { "firstName": "Prénom synthétique", "lastName": "Nom synthétique", "birthDate": "1985-01-01" },
  "mustNotReachModel": []
}
```

- `identity`/`mustNotReachModel` : voir « Pseudonymisation et fuites » plus bas — obligatoires sur
  chaque cas des trois harnais. Choisir un prénom/nom qui n'apparaît pas dans le texte du cas et qui
  ne collide pas avec un éponyme clinique (`CLINICAL_EPONYMS` de `pseudonymService.js` : Lachman,
  Thomas, Ober, Speed, Roos… souvent des alias du catalogue) ni avec un mot du vocabulaire envoyé au
  modèle pour la correction.
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

## Pseudonymisation et fuites

Depuis le 2026-09-12, les trois harnais (`eval:extraction`, `eval:dictation`, `eval:session`)
pseudonymisent le texte envoyé au modèle exactement comme en production
(`services/pseudonymService.js`, design `docs/superpowers/specs/2026-09-12-pseudonymisation-design.md`) :
chaque cas construit un `pseudo = createPseudonymizer({ patient: c.identity, kine, at })` (kiné
synthétique fixe `{ firstName: 'Valentin', lastName: 'Durand', email: null }`) et le transmet à
`correct`, `runCase`/`extractFromText`, `composeSections`. Le nom, le prénom et la date de naissance
du patient sont masqués avant tout appel au modèle, et réhydratés dans les sorties (texte corrigé,
candidats, sections rédigées) — les notes réelles ne quittent jamais le serveur.

- **`identity`** (par cas, dans `cases.json`) : `{ firstName, lastName, birthDate }`, tous
  synthétiques, jamais l'identité réelle d'un patient. Pour les cas de séance, le `lastName` reprend
  volontairement le nom prononcé dans la transcription (Martin, Delcourt, Rosier, Vasseur, Berthier)
  — c'est ce nom réel du corpus que la pseudonymisation doit intercepter ; `firstName` et `birthDate`
  sont inventés, absents du texte. Pour les notes et dictées (aucun nom dans le texte source),
  l'identité entière est synthétique.
- **`mustNotReachModel`** (par cas) : formes de tiers repérées dans le corpus par
  `grep -iE "(docteur|dr|monsieur|madame|mon fils|ma fille|ma femme|mon mari) [A-Z]…"` sur la
  transcription — vide si le corpus n'en nomme aucun (cas actuel des 5 séances : les tiers cités,
  « mon mari », « ma femme », « ma fille », n'ont pas de nom propre attaché).
- **Garde anti-fuite** (`installLeakGuard`, `backend/eval/extraction/lib.js`) : enveloppe
  `llmService.chatCompletion`, cherche chaque forme interdite du cas (`identityOf(kase)` : prénom,
  nom, date de naissance sous ses formes canoniques **et en toutes lettres**, `mustNotReachModel`)
  dans le texte des messages envoyés — repli accents/casse identique au
  service, recherche en mot entier, jamais bloquant. `eval:session` posant ses cas en parallèle
  (`Promise.all`), une seule garde globale est installée avant le lancement, avec l'union des formes
  interdites de tous les cas ; chaque cas relit `guard.leaks` filtré sur ses propres formes une fois
  sa propre chaîne d'appels terminée (les formes ne se recoupent jamais entre patients, l'attribution
  reste donc exacte sans poser une garde par appel concurrent). `eval:extraction` et `eval:dictation`,
  séquentiels, posent et retirent une garde par cas.
- **Lire une fuite** : un cas fuité imprime `FUITE (n)` suivi des **types** concernés (« Prénom »,
  « NOM », « Tiers »), jamais la valeur — cohérent avec la règle « aucun nom dans les sorties du
  harnais ». Le cas compte alors en erreur (`summarize` sort en code 1). Chaque cas imprime aussi
  `pseudo.stats()` (« jetons : NOM ×2, Tiers ×1 ») : nombre de jetons posés par type, jamais leur
  valeur.
- **Run de référence du 2026-09-12** (`mistral-medium-3-5`, après pseudonymisation) : **0 fuite**
  sur les 23 cas des trois harnais. `eval:extraction` (13 cas) : rappel moyen **98,6 %**, 0 interdit.
  `eval:dictation --correct` (5 cas) : rappel moyen **94,4 %**, 0 interdit. `eval:session --dump`
  (5 cas) : sections 100 %, rappel d'extraction **95,0 %** (dans la fourchette attendue), 3 interdits
  — préexistants, cf. « Run de référence » ci-dessous, sans lien avec la pseudonymisation.
  Un premier essai avait signalé une fuite sur `seance-05` (identité synthétique `Thomas`, qui
  collidait avec l'alias catalogue « thomas » du champ `test_thomas`, envoyé au modèle dans le
  vocabulaire de correction pour **tous** les cas, pas seulement celui-ci) : corrigé en changeant le
  prénom synthétique du cas (`Julien`), sans toucher au code — une identité de harnais doit éviter les
  éponymes cliniques (`CLINICAL_EPONYMS` de `pseudonymService.js`) et les alias du catalogue.
- **Anamnèse — défaut de guide relevé, sans fuite** : sur les 5 séances du dump, la section
  Identification & anamnèse commence systématiquement par `NOM, âge ans,` (ex. « MARTIN, 46 ans, »)
  au lieu de `Prénom NOM, âge ans,` attendu (« Sophie MARTIN, 46 ans, ») — le modèle omet le jeton
  `[Prénom]` plutôt que de le recopier. Aucun nom, réel ou synthétique, n'apparaît en clair (ni fuite
  RGPD ni fuite de test) : c'est une non-conformité au gabarit du guide de rédaction, à corriger côté
  prompt (`SECTION_GUIDE.anamnese`) si le format « Prénom NOM » est requis à l'affichage.

## Eval — pseudonymisation (gratuit, déterministe)

```bash
cd backend
npm run eval:pseudonym                     # les 10 clips
npm run eval:pseudonym -- --only pseudo-03 # un seul
```

**Aucun appel au provider** : le harnais ne fait tourner que `pseudonymService` sur dix
transcriptions courtes réelles (`asr-worker/eval/gen_pseudo.py` génère les clips avec edge-tts puis
les transcrit ; les `.wav` et les `.txt` restent hors dépôt, comme tout `asr-worker/eval/audio/` et
`out/`). Il mesure les **faux positifs et les faux négatifs du masquage**, pas la qualité du modèle :
pour chaque cas il imprime la transcription, le texte masqué, les jetons posés et la réhydratation,
puis vérifie trois choses — les `expectTokens` sont bien posés, le contenu clinique listé dans `keep`
a survécu, et l’identité du cas n’est plus lisible dans le texte masqué (un nom qui est aussi un mot
courant n’est une fuite que capitalisé, cf. `commonWords`). Le texte s’affiche ici, contrairement aux
logs applicatifs, parce que le corpus est entièrement synthétique.

État au 2026-09-12, après les correctifs de revue : **10/10**. Les deux cas qui portent une `note`
documentent un artefact de transcription (Whisper perd l’arobase d’un e-mail, transcrit « Lachman »
en « lâchement »), pas une limite du service.

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

Chaîne de la séance : transcription (`asr-worker/eval/out/seance-0N_*.txt`, dialogue à deux voix) →
**passe de correction obligatoire** (`services/dictationCorrectionService.correct`, mode `session`)
→ extraction sur le dialogue corrigé (même logique partagée `runCase`/`printResult`/`summarize` que
`eval:extraction`/`eval:dictation`) → rédaction des sept sections depuis ce même dialogue
(`services/bilanComposeService.composeSections`, `source: 'dialogue'`, mesures acceptées exclues de
la prose comme en production). Depuis le 2026-09-12, il n'y a plus d'étape « compte rendu »
intermédiaire : le rédacteur lit le dialogue directement.

Contrairement à `eval:dictation`, il n'y a pas de flag `--correct` ici : la correction fait partie
intégrante de la chaîne de séance, donc toujours appliquée.

```bash
cd backend
npm run eval:session                        # 5 cas, variante clean (défaut)
npm run eval:session -- --variant cabinet   # variante cabinet (bruit de salle)
npm run eval:session -- --only seance-03    # un seul cas
npm run eval:session -- --json out.json     # + dump JSON des résultats
npm run eval:session -- --dump out/sessions # sections rédigées écrites en .md, un fichier par cas
```

**`--dump <dossier>`** écrit les sections rédigées en Markdown (`<cas>_<variante>.md`) pour les
relire — corpus synthétique seulement, jamais de texte réel.

⚠️ Coût : **3 appels réels au provider par cas** (correction, extraction, rédaction), soit
15 appels pour les 5 cas d'une variante (quelques dizaines de centimes). Les trois services
journalisent leurs compteurs d'usage (`prompt_tokens` / `completion_tokens` en `logger.info`, sans
aucun texte) : le coût par séance se lit dans les logs applicatifs.

Ce qui est mesuré, en plus du rappel d'extraction habituel :
- **sections attendues rédigées** : sur les 7 sections du document (`anamnese`, `antecedents`,
  `examen`, `limitations`, `diagnostic`, `objectifs`, `traitement`), combien de celles que le cas
  attend (`expectSections`) sont effectivement non vides dans la rédaction.
- **sections avec nombre non vérifié ou doublon de tableau** : les avertissements du rédacteur
  (`composeSections`, `warnings`). Informatif, sans seuil : un nombre « non vérifié » signale une
  valeur absente de l'ensemble autorisé (le dialogue porte ses nombres en lettres, la garde les
  accepte), un « doublon de tableau » une mesure déjà présente dans le tableau et reprise en prose.

Seuils d'ouverture du bouton (spec §6), vérifiés en fin de run : sections attendues rédigées ≥ 80 %,
rappel d'extraction moyen ≥ 85 % (variante clean), **et aucun cas en erreur** (une transcription
absente ou un appel provider en échec ne doit pas passer pour une réussite au prétexte que la
moyenne des cas aboutis tient). Code de sortie 1 si un seuil n'est pas atteint (en plus des cas
déjà gérés par `summarize` : interdits, cas en erreur).

Attente retirée du corpus : `kinésiophobie` (seance-01, seance-04). Le catalogue n'a pas de champ
dédié et l'extracteur la mappe sur `peur_de_chuter`, un concept différent : l'attendre en mesure
libre testait le harnais, pas le pipeline.

### Run de référence du 2026-09-12 (variante clean, `mistral-medium-3-5`)

Chaîne directe, 5 séances : **sections attendues rédigées 100 %**, **rappel d'extraction 98,3 %**,
**0 nombre non vérifié**, 4 sections avec doublon de tableau. 4 « interdits » relevés par
`summarize` = 3 mesures libres attendues absentes sur `seance-05` (préexistant) + 1 valeur
auto-corrigée dans le dialogue (`seance-02` : abduction annoncée à 80 puis rectifiée à 90,
l'extracteur a gardé 80). Ce dernier point est un sujet **extracteur**, à traiter un jour de ce
côté-là, pas par une étape de traitement supplémentaire.

Rejeu du même jour après la suppression définitive de l'étape (même chaîne, même provider) : sections
100 %, rappel d'extraction **93,3 %** (seance-01 à 83 % avec 5 candidats écartés : variance de l'extracteur,
pas de changement de code entre les deux runs), 0 nombre non vérifié, 4 doublons de tableau, mêmes 80/90 sur
seance-02. Retenir une fourchette 93–98 % plutôt qu'un chiffre unique.

Comparaison avec l'ancienne chaîne à compte rendu (mêmes cas) : rappel d'extraction 88,7 %, et
~70 s de traitement après la transcription contre **~15 s** pour la chaîne directe.

Ancienne chaîne (compte rendu), détail par séance et conclusion, conservés pour mémoire :
`asr-worker/README.md`, section « Correction → Séance ».

### Rejeu du 2026-09-12 après pseudonymisation (identité par cas, garde anti-fuite)

Même chaîne, même provider, cases.json enrichi d'`identity`/`mustNotReachModel` (voir « Pseudonymisation
et fuites » plus haut) : sections attendues rédigées **100 %**, rappel d'extraction **95,0 %** (dans la
fourchette 93–98 % ci-dessus), 0 nombre non vérifié, 4 sections avec doublon de tableau, 0 fuite. Les
3 « interdits » relevés par `summarize` sont les 3 mesures libres attendues absentes sur `seance-05`
déjà documentées ci-dessus (préexistant, sans lien avec la pseudonymisation) ; `seance-02` garde le
même sujet extracteur (80/90). Seuils d'ouverture : ATTEINTS.
