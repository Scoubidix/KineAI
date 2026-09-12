# asr-worker

Worker de transcription pour la dictée du bilan kiné. Service FastAPI autonome, sans base de
données ni stockage : il reçoit un segment audio, le transcrit avec faster-whisper (modèle
`large-v3-turbo`, CPU, quantification int8) et renvoie le texte. Aucun fichier audio n'est écrit
sur disque ; le décodage se fait entièrement en mémoire.

## Lancement local

```bash
cd asr-worker
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements.txt   # ou .venv/bin/pip sur Linux/Mac
ASR_WORKER_TOKEN=dev-token .venv/Scripts/python.exe -m uvicorn app:app --port 8100
```

Sous PowerShell (Windows), les variables se posent avec `$env:` :

```powershell
cd asr-worker
$env:ASR_WORKER_TOKEN = "dev-token"
$env:ASR_MODEL_PATH = "$HOME\.cache\huggingface\hub\models--mobiuslabsgmbh--faster-whisper-large-v3-turbo\snapshots\0a363e9161cbc7ed1431c9597a8ceaf0c4f78fcf"
$env:HF_HUB_OFFLINE = "1"
.venv\Scripts\python.exe -m uvicorn app:app --port 8100
```

`ASR_MODEL_PATH` + `HF_HUB_OFFLINE=1` évitent que faster-whisper interroge Hugging Face au démarrage :
le dépôt `mobiuslabsgmbh/faster-whisper-large-v3-turbo` a été déplacé vers
`dropbox-dash/faster-whisper-large-v3-turbo`, et sans ces variables la résolution du nom
`large-v3-turbo` passe par le réseau et peut retélécharger 1,6 Go dans un nouveau dossier de cache.
Le chemin ci-dessus est le snapshot déjà présent sur le poste de développement (adapter le hash si le
cache change : `ls ~/.cache/huggingface/hub/models--mobiuslabsgmbh--faster-whisper-large-v3-turbo/snapshots`).

Le modèle se charge en tâche de fond dès le démarrage du serveur (le port écoute tout de suite) :
`/healthz` répond `503 {"status": "loading"}` pendant le chargement (quelques secondes à quelques
dizaines de secondes sur CPU selon l'état du cache disque), puis `200 {"status": "ok", ...}` une
fois prêt. `/v1/transcribe` répond aussi `503` (en-tête `Retry-After: 10`) pendant ce temps.

## Tests

```bash
cd asr-worker
.venv/Scripts/python.exe -m pytest
```

## Variables d'environnement

| Variable | Rôle | Défaut |
|---|---|---|
| `ASR_WORKER_TOKEN` | Jeton Bearer requis par `/v1/transcribe` (obligatoire, pas de défaut) | — |
| `ASR_SLOTS` | Nombre de transcriptions simultanées (places de l'ordonnanceur, et `num_workers` faster-whisper — la parallélisation réelle) | `2` |
| `ASR_THREADS` | Threads CPU par transcription (`cpu_threads` de faster-whisper) | `2` |
| `ASR_MODEL` | Nom du modèle faster-whisper | `large-v3-turbo` |
| `ASR_MODEL_PATH` | Chemin local du modèle (si prétéléchargé par `download_model.py`) | — (résolution HF) |
| `ASR_DEVICE` | Device faster-whisper (`cpu`, `cuda`) | `cpu` |
| `ASR_COMPUTE_TYPE` | Quantification faster-whisper | `int8` |
| `ASR_INTERACTIVE_WAIT_MAX` | Attente max (s) d'une requête `interactive` en file avant `503 Busy` | `30` |
| `ASR_BATCH_QUEUE_MAX` | Taille max de la file `batch` avant refus `503 Busy` | `20` |
| `ASR_BATCH_MAX_SLOTS` | Places que les requêtes `batch` (séance) peuvent occuper en même temps : le reste est réservé aux dictées `interactive` | `ASR_SLOTS − 1` (au moins 1) |

## Contrat HTTP

### `POST /v1/transcribe`

Multipart, en-tête `Authorization: Bearer <ASR_WORKER_TOKEN>`.

Champs :
- `audio` (fichier, obligatoire) — n'importe quel conteneur décodable par PyAV (webm/opus,
  mp4/aac, wav…), 8 Mo max, 60 s max.
- `language` (optionnel, défaut `fr`)
- `prompt` (optionnel, texte de contexte — vocabulaire attendu — tronqué aux 200 derniers mots)
- `priority` (optionnel, `interactive` | `batch`, défaut `interactive`)

Réponse `200` :

```json
{ "text": "...", "audio_seconds": 2.0, "processing_seconds": 1.3, "model": "large-v3-turbo" }
```

Erreurs : `401` (jeton absent ou invalide), `422` (audio indécodable, trop long, ou `priority`
invalide), `413` (corps trop volumineux), `503` (modèle en cours de chargement, ou places et file
saturées — en-tête `Retry-After`).

### `GET /healthz`

```json
{ "status": "ok", "model": "large-v3-turbo", "slots": 2, "busy": 0, "queued": 0 }
```

`status` vaut `"loading"` (code `503`) tant que le modèle n'est pas chargé (chargement en tâche
de fond au démarrage, le serveur écoute dès le lancement), `"ok"` (code `200`) ensuite.

## Déploiement (Clever Cloud)

- Runtime Python 3.13 (`CC_PYTHON_VERSION=3.13` — le lock `requirements.lock` a été figé sous
  3.13.7, à utiliser tel quel)
- `CC_PIP_REQUIREMENTS_FILE=requirements.lock` : indique à Clever Cloud d'installer le lock, pas
  `requirements.txt`. `requirements.txt` reste le fichier de dev (inclut tests, edge-tts, jiwer,
  inutiles — et plus lourds — en production)
- `CC_RUN_COMMAND=uvicorn app:app --host 0.0.0.0 --port 8080 --workers 1`
- `CC_POST_BUILD_HOOK=python download_model.py` (télécharge le modèle dans `./models` au build,
  pour que les instances ajoutées par le scaling démarrent sans réseau)
- `ASR_MODEL_PATH=./models/large-v3-turbo`
- `CC_HEALTH_CHECK_PATH=/healthz` — répond `503 {"status": "loading"}` pendant 30 à 90 s après le
  démarrage (chargement du modèle en tâche de fond, cf. « Lancement local » ci-dessus) : le health
  check de déploiement doit tolérer cette fenêtre (Clever Cloud attend le premier `2xx`, mais le
  délai avant qu'il arrive dépend de sa propre config de retry/timeout — à vérifier au premier
  déploiement).
- Flavor : M
- Scaling : 1 → 3 instances
- Dimensionnement : `ASR_SLOTS × ASR_THREADS` ne doit pas dépasser le nombre de vCPU du flavor
  (chaque place tourne `ASR_THREADS` threads CPU, et `ASR_SLOTS` places peuvent tourner en
  parallèle via `num_workers` faster-whisper).

### Dimensionnement avant ouverture sur staging

Le RTF du bench ci-dessous (0,26-0,37) a été mesuré sur un poste de développement (i7 de bureau),
pas sur le flavor Clever Cloud réel. Avant d'ouvrir la fonctionnalité sur staging, relancer le
bench HTTP contre le worker déployé :

```bash
python eval/bench.py --url https://<worker> --concurrency 2 --only dictee-01
```

Si le RTF mesuré dépasse 0,7, augmenter `ASR_REQUEST_TIMEOUT_MS` côté backend (défaut 90 000 ms)
et/ou réduire `MAX_SEGMENT_MS` dans `dictationRecorder.ts` (front) pour raccourcir les segments
envoyés.

## Bench

Corpus synthétique : cinq dictées (`eval/scripts/dictee-0N.txt`, une par pathologie — lombalgie,
épaule opérée, genou/ligamentoplastie, cervicalgie, entorse de cheville), générées en audio par
`eval/gen_dictation.py` (edge-tts, voix `fr-FR-HenriNeural`) en deux variantes chacune :
`_clean` (voix seule) et `_cabinet` (bruit rose + réverb + filtrage passe-bande, simulant un micro
éloigné en salle de kiné). `eval/bench.py` transcrit chaque fichier (découpé en tranches d'environ
45 s, le worker refusant plus de 60 s — la coupe cherche le point le plus silencieux dans les 5
dernières secondes de chaque fenêtre, comme le recorder du navigateur, pour ne pas trancher en
pleine réplique), calcule le WER (référence = script tel quel, normalisé casse/ponctuation/espaces
via `jiwer`), le RTF (temps de traitement / durée audio) et le nombre de termes kiné reconnus
(`TERMES`, 18 termes), et écrit `eval/out/<nom>.txt`.

`--concurrency` n'est qu'un interrupteur (un thread par segment au-delà de 1, utile uniquement avec
`--url` pour paralléliser sur les places du worker HTTP) ; avec une séance découpée en une vingtaine
de segments, le mode local (sans `--url`, in-process) reste préférable.

Le WER référence-hypothèse compare deux textes dont les nombres ne s'écrivent pas pareil : la
référence les a en toutes lettres (dictées telles quelles), faster-whisper les transcrit en
chiffres (« cinquante-deux ans » → « 52 ans »). `normalize_numbers` (dans `bench.py`) réécrit les
nombres en toutes lettres en chiffres des deux côtés avant le calcul du WER (0-99 avec composés,
centaines, milliers pour les années ; `un`/`une` seulement juste avant un mot d'unité — degré,
centimètre, kilo, seconde, semaine, mois, fois, sur — pour ne pas confondre avec l'article). La
table garde les deux colonnes : `WER` (nombres normalisés, métrique de référence) et `WER brut`
(sans cette normalisation, comportement d'avant, gardé pour la continuité de la mesure). Vérifiable
avec `.venv/Scripts/python.exe eval/bench.py --selftest`.

Cibles de la spec : WER < 10 % (clean), WER < 20 % (cabinet), RTF < 0,5.

Machine de référence : Intel Core i7-14700K (28 threads logiques), Windows 11. Modèle
`large-v3-turbo`, CPU, int8. Date : 2026-09-10.

### Run in-process (10 fichiers, `ASR_THREADS=2` par défaut)

```
.venv/Scripts/python.exe eval/bench.py
```

```
fichier                       audio  temps   RTF    WER  WER brut termes
dictee-01_cabinet                97     36  0.37  11.7%     17.4% 3/18
dictee-01_clean                  97     36  0.37  11.7%     17.4% 3/18
dictee-02_cabinet                84     29  0.34   6.6%     15.2% 0/18
dictee-02_clean                  84     29  0.34   8.3%     15.8% 0/18
dictee-03_cabinet                81     28  0.35  12.8%     23.2% 0/18
dictee-03_clean                  81     28  0.35  12.1%     21.9% 0/18
dictee-04_cabinet                81     28  0.35  11.2%     21.4% 3/18
dictee-04_clean                  81     28  0.35   9.2%     19.5% 4/18
dictee-05_cabinet                84     28  0.34   9.6%     16.3% 4/18
dictee-05_clean                  84     28  0.34   9.6%     16.3% 4/18
```

Wall-clock : 5 min 1 s pour les dix fichiers.

RTF < 0,5 atteint sur les dix fichiers (0,34-0,37). WER (nombres normalisés) **atteint** sur 8/10
fichiers (cabinet : 11,7 % / 6,6 % / 12,8 % / 11,2 % / 9,6 % — cible < 20 %, 5/5 atteints ; clean :
11,7 % / 8,3 % / 12,1 % / 9,2 % / 9,6 % — cible < 10 %, 3/5 atteints, `dictee-01_clean` 11,7 % et
`dictee-03_clean` 12,1 % la ratent de peu). La colonne `WER brut` (15-23 %, toutes cibles ratées)
montre l'ampleur du delta expliqué par les nombres seuls : 5,7 à 10,4 points de WER selon le
fichier. Le résidu restant après normalisation vient d'erreurs de reconnaissance authentiques mais
mineures (ex. « Schober » → « Chobet », « sept » → « c'est », désaccords singulier/pluriel,
conjugaisons).

Ces mesures datent d'avant le passage de `split_segments` à la coupe au silence (tranches fixes de
45 s à l'époque) : une dictée est un monologue continu sans réplique à préserver, donc la coupe fixe
ne perdait pas de mots ici comme elle le faisait sur le corpus de séances (voir plus bas) — ces
chiffres restent valables tels quels, non rejoués.

### Run HTTP, `--concurrency 4` (worker `ASR_SLOTS=2`, `ASR_THREADS=2`, `dictee-01` uniquement)

```
ASR_WORKER_TOKEN=dev-token ASR_SLOTS=2 .venv/Scripts/python.exe -m uvicorn app:app --port 8100
.venv/Scripts/python.exe eval/bench.py --url http://localhost:8100 --concurrency 4 --only dictee-01
```

```
fichier                       audio  temps   RTF    WER  WER brut termes
dictee-01_cabinet                97     25  0.26  11.7%     17.4% 3/18
dictee-01_clean                  97     25  0.26  11.7%     17.4% 3/18
```

Wall-clock : 50 s. RTF meilleur qu'en in-process (0,26 contre 0,37) grâce à la parallélisation des
tranches de 45 s sur les 2 places du worker. WER identique au run in-process (même modèle, même
texte) : 11,7 % sur les deux variantes, cible clean (< 10 %) ratée de peu, cible cabinet (< 20 %)
atteinte.

### Corpus de séances

Deuxième corpus, à deux voix : cinq séances kiné-patient scriptées (`eval/sessions/seance-0N.txt`,
dialogues `K:` / `P:`, ligne vide = pause longue au changement de temps de la séance), générées en
audio par `eval/gen_session.py` (edge-tts, deux voix par fichier + silences insérés entre répliques
via ffmpeg) en deux variantes chacune : `_clean` et `_cabinet` (même dégradation que la dictée —
bruit rose, réverb, filtrage passe-bande, simulant un micro posé sur la table plutôt que tenu à la
main). Séances impaires : kiné `fr-FR-HenriNeural` (H), patient `fr-FR-DeniseNeural` (F) ; séances
paires : rôles inversés en genre, kiné `fr-FR-VivienneMultilingualNeural` (F), patient
`fr-FR-RemyMultilingualNeural` (H) — les quatre voix existent telles quelles côté edge-tts, aucun
repli n'a été nécessaire.

```bash
.venv/Scripts/python.exe eval/gen_session.py            # les cinq séances (dix fichiers audio)
ASR_MODEL_PATH=<snapshot local> HF_HUB_OFFLINE=1 ASR_THREADS=4 .venv/Scripts/python.exe eval/bench.py --only seance
```

Sans `--url`, le bench charge le modèle localement (in-process, comme `app.py`) : poser
`ASR_MODEL_PATH` (chemin du snapshot faster-whisper déjà en cache) et `HF_HUB_OFFLINE=1` comme pour
le worker, sous peine de tenter un accès réseau à Hugging Face.

`bench.py` calcule la référence des séances différemment de la dictée : `reference_text()` retire
les préfixes `K:`/`P:` des scripts (le texte réellement prononcé, sans les marqueurs de rôle) au
lieu de lire le script tel quel. Attendu par rapport à la dictée : audio 10 à 15 minutes par fichier
(contre ~1,5 minute), WER plus élevé (8 à 18 % visé, contre <10-20 % dictée) du fait du dialogue à
deux voix, du débit conversationnel (relances, hésitations, chevauchements de ton) et, pour
`_cabinet`, d'un micro posé plus dégradé qu'une dictée tenue près de la bouche.

Durées mesurées (`_clean`, `_cabinet` à la seconde près) : `seance-01` 11 min 34 s, `seance-02`
10 min 44 s, `seance-03` 14 min 29 s, `seance-04` 12 min 31 s, `seance-05` 15 min 3 s — dans la
fourchette visée (10-15 min), `seance-05` la dépasse de peu.

Le worker local tournait sans `ASR_WORKER_TOKEN` positionné dans son environnement
(`/v1/transcribe` répondait `401 {"detail":"jeton invalide"}` identiquement pour `dev-token` et pour
un jeton volontairement faux — `app.py` : `if not token or not compare_digest(...)` rejette tout dès
que `token` est une chaîne vide côté serveur). Sans droit de le redémarrer, le bench ci-dessous a
été lancé **en local** (in-process, sans `--url`, modèle chargé dans le process du bench) plutôt
qu'à travers le worker HTTP. Le RTF mesuré ci-dessous (4 threads CPU, dans le process du bench) n'est
donc pas directement comparable au RTF du run HTTP de la dictée plus haut (2 places worker + 2
threads chacune) : il reflète un seul processus faster-whisper à 4 threads, pas le multiplexage
places/priorités du scheduler HTTP.

### Résultats (dix fichiers, in-process, `ASR_THREADS=4`)

Run rejoué le 2026-09-12 après le passage de `split_segments` à la coupe au silence, le déplacement
de `EVA` en fin d'amorce (il faisait transcrire des « euh » en « EVA »), et la correction du script
`seance-04` (« Signe de Tinel négatif » → « … négatif à droite »).

```
fichier                       audio  temps   RTF    WER  WER brut termes
seance-01_cabinet               694    152  0.22   4.2%      5.5% 3/18
seance-01_clean                 694    151  0.22   4.9%      6.5% 4/18
seance-02_cabinet               645    144  0.22   2.8%      4.8% 0/18
seance-02_clean                 644    148  0.23   2.4%      4.7% 0/18
seance-03_cabinet               870    190  0.22   2.9%      4.8% 0/18
seance-03_clean                 869    193  0.22   2.7%      5.5% 0/18
seance-04_cabinet               752    169  0.22   2.5%      3.4% 3/18
seance-04_clean                 752    176  0.23   2.4%      3.2% 3/18
seance-05_cabinet               903    199  0.22   2.1%      3.4% 4/18
seance-05_clean                 903    204  0.23   2.2%      3.5% 3/18
```

RTF ≤ 0,23 sur les dix fichiers (cible < 0,5 largement atteinte). WER (nombres normalisés) 2,1 à
4,9 %, en net retrait par rapport au run précédent (3,5-7,3 %), largement sous la cible de la spec
(8-18 % visé, plus proche en réalité des cibles dictée < 10 %/< 20 %). La baisse la plus nette est
sur `seance-05` (7,3 % → 2,1 % cabinet, 5,4 % → 2,2 % clean) : la coupe au silence récupère les deux
répliques courtes du « knee to wall » (« droit », « dix centimètres ») qu'une coupe à date fixe
avalait — `knee_to_wall:D=10` (attendu dans `backend/eval/session/cases.json`) est maintenant bien
présent dans la transcription. `seance-02` à `seance-04` progressent aussi nettement (5,0-5,9 % →
2,4-2,9 %), pour partie grâce au retrait d'« EVA » de la tête de l'amorce. Seul `seance-01_clean`
remonte légèrement (3,8 % → 4,9 %) : l'amorce modifiée change la conditionnalisation du modèle sur
ce fichier précis, sans lien avec la segmentation (aucune réplique courte n'y était perdue). Le
corpus de séances synthétique reste plus propre qu'attendu — les deux voix edge-tts restent nettes
même en dialogue, et la dégradation `_cabinet` (bruit rose + réverb) ne pénalise pas autant
qu'espéré un modèle habitué au bruit de fond. `_cabinet` est systématiquement un peu au-dessus de
`_clean` (effet attendu), sauf `seance-02` où l'écart est négligeable.

Le corpus de séances contient bien du jargon kiné, contrairement à ce qu'affirmait une version
précédente de ce README (dialogue scripté, pas dicté, mais les tests et cotations y apparaissent
naturellement dans les répliques du kiné). Sur les 18 `TERMES` du bench, voici comment chacun
ressort des transcriptions `_clean` :

| Terme | Transcription obtenue |
|---|---|
| lasègue | intact (« Lasègue négatif à droite ») |
| schober | « Chobet » |
| sorensen | intact |
| mckenzie | intact (« méthode McKenzie ») |
| kinésiophobie | intact |
| supra-épineux | « supraépineux » (trait d'union perdu) |
| didt | « DID » (T final perdu) |
| lachman | « le lâchement » (homophone) |
| spurling | intact |
| phalen | « Phalan » |
| tinel | intact (« Tinel négatif à droite », depuis la correction du script) |
| jamar | absent des scripts de séance (n'apparaît que dans le corpus dictée) |
| dn4 | absent des scripts de séance (n'apparaît que dans le corpus dictée) |
| kleiger | « clé G » (homophone) |
| thompson | « Thomson » (un p perdu) |
| knee to wall | intact |
| fibulaires | intact |
| ottawa | intact |

La colonne `termes` (0 à 4 sur 18) mesure donc bien quelque chose ici, mais sous-compte : plusieurs
termes sont reconnus par le modèle sans matcher le libellé exact attendu par `TERMES` (accent,
espace, orthographe). La passe de correction (mode session) est obligatoire avant l'extraction ; le
harnais `eval:session` l'applique toujours.

Fichiers écrits : `eval/out/seance-0{1..5}_{clean,cabinet}.txt` (dix fichiers, vérifiés présents).

### Extraction

Au bout de la chaîne : les transcriptions ci-dessus (`asr-worker/eval/out/`) sont ensuite passées à
l'extraction IA du bilan (`backend/eval/dictation/run.js`, `npm run eval:dictation`), qui appelle le
vrai provider (`mistral-medium-3-5`) et compare aux mêmes attentes que le jeu d'évaluation sur texte
saisi (`backend/eval/extraction/`). Détail du harnais : `backend/eval/README.md`. Run réel du
2026-09-10 (5 dictées, un appel provider par cas) :

| Variante | Rappel moyen | Interdits |
|---|---|---|
| clean | 95,5 % | 0 |
| cabinet | 94,0 % | 0 |

Manquants par cas (mesure demandée, non corrigée dans cette tâche) :
- clean : `dictee-01` — `eva_effort` ; `dictee-03` — `eva_repos`, `extension_genou:D` (obtenu -5 au
  lieu de 5, signe inversé)
- cabinet : `dictee-01` — `eva_effort` ; `dictee-03` — `eva_repos`, `testing_ischio_jambiers:D`,
  `extension_genou:D` (même signe inversé)

Un premier run du 2026-09-10 comptait 2 « interdits » par variante sur `dictee-04`
(`customContains: ["spurling"]`) et `dictee-05` (`customContains: ["monopodal"]`) : erreur de plan
dans `cases.json`, pas un défaut d'extraction — le catalogue contient bien `test_spurling` (alias
`spurling`) et `appui_monopodal_secondes` (alias `appui monopodal`, `unipodal`), donc le modèle les
extrayait correctement en mesures canoniques, ce que `customContains` (qui cherche une mesure
*libre*) comptait à tort comme une violation. Corrigé : `customContains` vidé sur `dictee-03/04/05`,
`test_spurling:D=true` et `appui_monopodal_secondes:G=5` ajoutés à `expect` (dictee-04 et dictee-05).
Les chiffres ci-dessus sont le run de référence après correction (même date, mêmes fichiers audio).
Beaucoup d'« extra(s) » par ailleurs (mesures canoniques légitimes non listées dans `expect`, ex.
`etat_cicatrice`, `reflexes_osteotendineux`) : à relire au cas par cas, pas des erreurs en soi.

### Correction

`npm run eval:dictation -- --correct` ajoute une passe de correction
(`backend/services/dictationCorrectionService.correct`, mode `dictation`) avant l'extraction, sur
les mêmes transcriptions que ci-dessus.

Pendant une prise, du clic sur « Arrêter » à l'insertion, le texte n'existe qu'en mémoire du
navigateur (pas d'autosauvegarde incrémentale) : d'où le délai de 60 s posé côté front sur l'appel
de correction, pour ne jamais laisser une requête sans réponse bloquer indéfiniment l'insertion.

Un premier run de référence (2026-09-10, prompt initial) montrait la passe **abandonnée** (garde
« plafond d'opérations ») sur 8 des 10 dictées : le modèle proposait 14 à 25 opérations par
dictée, très au-dessus du plafond (~1 op/15 mots). Diagnostic : le modèle « retypait » le texte en
opérations *identiques* (`from` = `to`, ex. `dictee-01` proposait 34 opérations sans aucune
correction réelle) et, sur `dictee-03` cabinet, la réponse était tronquée à `max_tokens`. Deux
correctifs appliqués : (1) prompt système reformulé (consigne « 0 à 5 opérations », exemple
concret, « to » doit différer de « from »), (2) `applyOps` écarte désormais les opérations
identiques (`from`/`to` strictement égaux une fois les espaces normalisés) **avant** de compter
vers le plafond, au lieu de les laisser saturer le compte d'opérations.

Run de référence final, 2026-09-11, avec les gardes livrées (opérations identiques écartées en
stricte égalité, remplacement d'au plus un mot de plus que le fragment, suppression de fragment en
mode dictée seulement avec un marqueur d'auto-correction), mêmes fichiers audio, même provider
`mistral-medium-3-5`. Les valeurs « sans correction » sont celles du run de référence du plan dictée.

| Cas | Opérations clean (appliquées/ignorées) | Termes clean avant→après | Rappel clean sans/avec correction | Opérations cabinet (appliquées/ignorées) | Termes cabinet avant→après | Rappel cabinet sans/avec correction |
|---|---|---|---|---|---|---|
| dictee-01 | 2/2 | 3→4 | 92 % / 92 % | 3/2 | 3→5 | 92 % / 92 % |
| dictee-02 | 2/3 | 0→0 | 100 % / 100 % | 0/2 | 0→0 | 100 % / 100 % |
| dictee-03 | 2/3 | 0→0 | 86 % / 86 % | 4/1 | 0→0 | 79 % / 93 % |
| dictee-04 | 0/4 | 4→4 | 100 % / 100 % | 1/2 | 3→4 | 100 % / 100 % |
| dictee-05 | 2/3 | 4→4 | 100 % / 95 % | 7/3 | 4→4 | 100 % / 100 % |

Rappel moyen : clean 95,5 % sans correction → 94,4 % avec ; cabinet 94,0 % sans correction →
96,9 % avec. Aucune passe abandonnée (0 sur 10, contre 8 sur 10 avec le prompt initial et 1 sur 10
au run intermédiaire). 0 interdit dans tous les runs.

Lecture : la passe corrige des termes réels (`Schober` récupéré sur dictee-01 dans les deux
variantes, `Spurling` sur dictee-04 cabinet, 7 opérations appliquées sur dictee-05 cabinet) et ne
dégrade jamais le rappel de plus d'un champ ; les deux écarts restants (`douleur_nocturne` sur
dictee-05 clean, `eva_effort` sur dictee-01 dans tous les runs — la transcription porte « c'est à
l'effort », homophone « sept »/« c'est » déjà documenté dans le bench WER) ne sont pas touchés par
les opérations appliquées : ils tiennent à la transcription et au non-déterminisme de l'appel
d'extraction, comme observé aux runs précédents. Noté tel quel, sans retouche.

### Amorce de vocabulaire : essai A/B du 10 sept. 2026

Whisper ne garde que les 224 derniers tokens du prompt. L'amorce actuelle (75 mots, 180 tokens)
plus 80 mots de contexte (165 tokens) dépasse la fenêtre : dès le deuxième segment d'une prise,
seule la fin du vocabulaire survit. Quatre variantes mesurées sur trois dictées propres
(45 s par segment, worker local, WER nombres normalisés) :

| Dictée | Amorce actuelle | Sans amorce | Vocabulaire réduit en tête + 40 mots | Contexte 40 mots puis vocabulaire réduit |
|---|---|---|---|---|
| dictee-01 | 11,2 % | 12,7 % | 11,7 % | 11,7 % |
| dictee-03 | 14,1 % | 12,8 % | 18,1 % | 18,1 % |
| dictee-04 | 7,2 % | 7,9 % | 11,2 % | 10,5 % |

Conclusion : l'amorce actuelle reste la meilleure ou à égalité ; le vocabulaire réduit aux termes
rares dégrade ; les noms de tests écorchés (Lachman, Lasègue, Schober sur voix de synthèse) ne sont
récupérés par aucune variante. Le gain sur les termes passera par la passe de correction par modèle
de langue, pas par l'amorce. Ne pas rouvrir sans nouvelles données (enregistrements réels).
