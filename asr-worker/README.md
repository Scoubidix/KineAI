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

Cibles de la spec : WER < 10 % (clean), WER < 20 % (cabinet), RTF < 0,5.

Machine de référence : Intel Core i7-14700K (28 threads logiques), Windows 11. Modèle
`large-v3-turbo`, CPU, int8. Date : 2026-09-10.

### Run in-process (10 fichiers, `ASR_THREADS=2` par défaut)

```
.venv/Scripts/python.exe eval/bench.py
```

```
fichier                       audio  temps   RTF    WER termes
dictee-01_cabinet                97     36  0.37  17.4% 3/18
dictee-01_clean                  97     37  0.38  17.4% 3/18
dictee-02_cabinet                84     29  0.34  15.2% 0/18
dictee-02_clean                  84     30  0.35  15.8% 0/18
dictee-03_cabinet                81     52  0.64  23.2% 0/18
dictee-03_clean                  81     28  0.35  21.9% 0/18
dictee-04_cabinet                81     28  0.35  21.4% 3/18
dictee-04_clean                  81     30  0.37  19.5% 4/18
dictee-05_cabinet                84     30  0.36  16.3% 4/18
dictee-05_clean                  84     29  0.34  16.3% 4/18
```

Wall-clock : 5 min 31 s pour les dix fichiers.

RTF < 0,5 atteint sur 9/10 fichiers (`dictee-03_cabinet` à 0,64, probablement une passe VAD plus
coûteuse liée au bruit). WER **non atteint** sur les dix fichiers (15 à 23 %, cible < 10 %/< 20 %) :
mesure de référence à date, pas un critère d'acceptation de cette tâche. Le principal facteur est
que faster-whisper transcrit les nombres en chiffres (« 52 ans », « 2018 », « L4-L5 ») alors que la
référence les a en toutes lettres (dictées telles quelles par la synthèse) — ce delta de
normalisation gonfle le WER indépendamment de la qualité de transcription réelle ; la normalisation
`jiwer` appliquée ne convertit pas les nombres. Quelques erreurs de reconnaissance authentiques
s'y ajoutent (ex. « Schober » → « Chobet », « sept » → « c'est », désaccords singulier/pluriel).

### Run HTTP, `--concurrency 4` (worker `ASR_SLOTS=2`, `ASR_THREADS=2`, `dictee-01` uniquement)

```
ASR_WORKER_TOKEN=dev-token ASR_SLOTS=2 .venv/Scripts/python.exe -m uvicorn app:app --port 8100
.venv/Scripts/python.exe eval/bench.py --url http://localhost:8100 --concurrency 4 --only dictee-01
```

```
fichier                       audio  temps   RTF    WER termes
dictee-01_cabinet                97     28  0.29  17.4% 3/18
dictee-01_clean                  97     26  0.27  17.4% 3/18
```

Wall-clock : 54 s. RTF meilleur qu'en in-process (0,27-0,29 contre 0,37-0,38) grâce à la
parallélisation des tranches de 45 s sur les 2 places du worker. WER identique au run in-process
(même modèle, même texte) : cible non atteinte, mêmes causes (nombres en chiffres + quelques
erreurs de reconnaissance).
