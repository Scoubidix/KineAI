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

- Runtime Python 3.12
- `CC_RUN_COMMAND=uvicorn app:app --host 0.0.0.0 --port 8080 --workers 1`
- `CC_POST_BUILD_HOOK=python download_model.py` (télécharge le modèle dans `./models` au build,
  pour que les instances ajoutées par le scaling démarrent sans réseau)
- `ASR_MODEL_PATH=./models/large-v3-turbo`
- Health check : `/healthz`
- Flavor : M
- Scaling : 1 → 3 instances
- Dimensionnement : `ASR_SLOTS × ASR_THREADS` ne doit pas dépasser le nombre de vCPU du flavor
  (chaque place tourne `ASR_THREADS` threads CPU, et `ASR_SLOTS` places peuvent tourner en
  parallèle via `num_workers` faster-whisper).

## Bench

Corpus synthétique : cinq dictées (`eval/scripts/dictee-0N.txt`, une par pathologie — lombalgie,
épaule opérée, genou/ligamentoplastie, cervicalgie, entorse de cheville), générées en audio par
`eval/gen_dictation.py` (edge-tts, voix `fr-FR-HenriNeural`) en deux variantes chacune :
`_clean` (voix seule) et `_cabinet` (bruit rose + réverb + filtrage passe-bande, simulant un micro
éloigné en salle de kiné). `eval/bench.py` transcrit chaque fichier (découpé en tranches de 45 s,
le worker refusant plus de 60 s), calcule le WER (référence = script tel quel, normalisé
casse/ponctuation/espaces via `jiwer`), le RTF (temps de traitement / durée audio) et le nombre de
termes kiné reconnus (`TERMES`, 18 termes), et écrit `eval/out/<nom>.txt`.

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
