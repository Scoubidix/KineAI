"""Télécharge le modèle dans ./models pour que les instances ajoutées par le scaling démarrent sans réseau."""
# Le dépôt mobiuslabsgmbh/faster-whisper-large-v3-turbo a été déplacé vers dropbox-dash/… (redirection HF).
import os
from huggingface_hub import snapshot_download

REPO = os.environ.get("ASR_MODEL_REPO", "dropbox-dash/faster-whisper-large-v3-turbo")
DEST = os.environ.get("ASR_MODEL_PATH", "models/large-v3-turbo")
snapshot_download(REPO, local_dir=DEST)
print("modèle prêt :", DEST)
