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

_À compléter (Task 2)._
