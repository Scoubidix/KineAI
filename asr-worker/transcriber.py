"""Décodage audio en mémoire et transcription faster-whisper."""
import io

import av
import numpy as np
from faster_whisper import WhisperModel

SAMPLE_RATE = 16000


class AudioInvalid(Exception):
    pass


class AudioTooLong(Exception):
    pass


def decode_audio(data: bytes, max_seconds: float) -> np.ndarray:
    """N'importe quel conteneur (webm/opus, mp4/aac, wav…) → float32 mono 16 kHz, sans fichier temporaire."""
    if not data:
        raise AudioInvalid("vide")
    chunks = []
    total = 0
    try:
        with av.open(io.BytesIO(data)) as container:
            stream = next((s for s in container.streams if s.type == "audio"), None)
            if stream is None:
                raise AudioInvalid("pas de piste audio")
            resampler = av.AudioResampler(format="s16", layout="mono", rate=SAMPLE_RATE)
            for frame in container.decode(stream):
                for out in resampler.resample(frame):
                    arr = out.to_ndarray().reshape(-1)
                    chunks.append(arr)
                    total += arr.shape[0]
                    if total / SAMPLE_RATE > max_seconds:
                        raise AudioTooLong()
            for out in resampler.resample(None):
                chunks.append(out.to_ndarray().reshape(-1))
    except (AudioInvalid, AudioTooLong):
        raise
    except Exception as e:  # conteneur corrompu, codec inconnu
        raise AudioInvalid(type(e).__name__) from e
    if not chunks:
        raise AudioInvalid("aucun échantillon")
    return np.concatenate(chunks).astype(np.float32) / 32768.0


class Transcriber:
    def __init__(self, model="large-v3-turbo", device="cpu", compute_type="int8", threads=2, workers=1, model_path=None):
        self.model_name = model
        self.model = WhisperModel(
            model_path or model, device=device, compute_type=compute_type,
            cpu_threads=int(threads), num_workers=int(workers),
        )

    def transcribe(self, pcm: np.ndarray, language: str = "fr", prompt: str = "") -> str:
        segments, _ = self.model.transcribe(
            pcm, language=language, beam_size=5, vad_filter=True,
            initial_prompt=prompt or None, condition_on_previous_text=False,
        )
        return " ".join(s.text.strip() for s in segments).strip()
