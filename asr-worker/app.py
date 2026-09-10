"""Worker ASR : transcription de segments audio par faster-whisper, places limitées, aucun stockage."""
import asyncio
import logging
import os
import secrets
import time
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager, suppress

import starlette.formparsers
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

from scheduler import Busy, Scheduler
from transcriber import SAMPLE_RATE, AudioInvalid, AudioTooLong, Transcriber, decode_audio

MAX_BYTES = 8 * 1024 * 1024
MAX_REQUEST_BYTES = MAX_BYTES + 64 * 1024  # tolérance overhead multipart (boundaries, champs)
MAX_SECONDS = 60.0
MAX_PROMPT_WORDS = 200
PRIORITIES = ("interactive", "batch")

# L'audio ne doit jamais toucher le disque : Starlette spoolerait le multipart dans un fichier
# temporaire au-delà de ce seuil, avant même nos vérifications (jeton, taille). Aligné sur
# MAX_REQUEST_BYTES (la limite qu'accepte déjà la garde Content-Length ci-dessous).
starlette.formparsers.MultiPartParser.spool_max_size = MAX_REQUEST_BYTES + 1

logging.basicConfig(level=os.environ.get("ASR_LOG_LEVEL", "INFO"), format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("asr")


def default_transcriber_factory():
    return Transcriber(
        model=os.environ.get("ASR_MODEL", "large-v3-turbo"),
        device=os.environ.get("ASR_DEVICE", "cpu"),
        compute_type=os.environ.get("ASR_COMPUTE_TYPE", "int8"),
        threads=os.environ.get("ASR_THREADS", "2"),
        workers=os.environ.get("ASR_SLOTS", "2"),  # num_workers ctranslate2 = places de l'ordonnanceur
        model_path=os.environ.get("ASR_MODEL_PATH") or None,
    )


def create_app(transcriber_factory=None, load_on_startup=True) -> FastAPI:
    slots = int(os.environ.get("ASR_SLOTS", "2"))
    model_name = os.environ.get("ASR_MODEL", "large-v3-turbo")
    token = os.environ.get("ASR_WORKER_TOKEN", "")
    # Une place reste réservée aux dictées : les batch (séance) n'en occupent que ASR_BATCH_MAX_SLOTS
    sched = Scheduler(slots, float(os.environ.get("ASR_INTERACTIVE_WAIT_MAX", "30")), int(os.environ.get("ASR_BATCH_QUEUE_MAX", "20")),
                      int(os.environ.get("ASR_BATCH_MAX_SLOTS", str(max(1, slots - 1)))))
    pool = ThreadPoolExecutor(max_workers=slots)
    state = {"transcriber": None, "load_error": None}
    factory = transcriber_factory or default_transcriber_factory

    async def _load():
        try:
            t0 = time.monotonic()
            state["transcriber"] = await asyncio.get_running_loop().run_in_executor(None, factory)
            log.info("modèle %s chargé en %.1fs, %d place(s)", model_name, time.monotonic() - t0, slots)
        except Exception as exc:  # modèle introuvable, chemin invalide, OOM…
            log.exception("chargement du modèle impossible")
            state["load_error"] = str(exc)

    @asynccontextmanager
    async def lifespan(_app):
        # Chargement en tâche de fond : le lifespan rend la main tout de suite pour que le
        # socket écoute et que /healthz (puis /v1/transcribe) répondent « loading » pendant ce temps.
        load_task = asyncio.create_task(_load()) if load_on_startup else None
        yield
        if load_task is not None:
            load_task.cancel()
            # _load() capture déjà ses propres erreurs ; ceinture et bretelles pour ne jamais
            # laisser le shutdown planter (et donc sauter pool.shutdown) si une exception fuit.
            with suppress(asyncio.CancelledError, Exception):
                await load_task
        pool.shutdown(wait=False)

    app = FastAPI(title="asr-worker", lifespan=lifespan)

    @app.get("/healthz")
    async def healthz():
        if state["load_error"] is not None:
            body = {"status": "error", "model": model_name, "slots": slots, "busy": sched.busy, "queued": sched.queued, "error": state["load_error"]}
            return JSONResponse(body, status_code=503)
        ready = state["transcriber"] is not None
        body = {"status": "ok" if ready else "loading", "model": model_name, "slots": slots, "busy": sched.busy, "queued": sched.queued}
        return JSONResponse(body, status_code=200 if ready else 503)

    @app.post("/v1/transcribe")
    async def transcribe(request: Request):
        # Jeton en bytes (jamais en str) : un en-tête non-ASCII ne doit jamais lever
        # (hmac.compare_digest refuse les str non-ASCII), juste être refusé en 401.
        authorization = request.headers.get("authorization", "")
        expected = f"Bearer {token}".encode()
        if not token or not secrets.compare_digest(authorization.encode("latin-1", "ignore"), expected):
            log.warning("jeton refusé")
            raise HTTPException(status_code=401, detail="jeton invalide")
        if state["transcriber"] is None:
            return JSONResponse({"error": "loading"}, status_code=503, headers={"Retry-After": "10"})
        content_length = request.headers.get("content-length")
        if content_length is not None:
            try:
                too_big = int(content_length) > MAX_REQUEST_BYTES
            except ValueError:
                too_big = False
            if too_big:  # rejeté avant même de lire le corps
                raise HTTPException(status_code=413, detail="audio trop volumineux")
        form = await request.form()
        try:
            audio = form.get("audio")
            if audio is None or not hasattr(audio, "read"):
                raise HTTPException(status_code=422, detail="audio manquant")
            language = str(form.get("language") or "fr")
            prompt = str(form.get("prompt") or "")
            priority = str(form.get("priority") or "interactive")
            if priority not in PRIORITIES:
                raise HTTPException(status_code=422, detail="priority invalide")
            data = await audio.read()
        finally:
            await form.close()  # libère l'UploadFile (et son éventuel spool) sans attendre
        if len(data) > MAX_BYTES:
            raise HTTPException(status_code=413, detail="audio trop volumineux")
        words = prompt.split()
        prompt = " ".join(words[-MAX_PROMPT_WORDS:])
        loop = asyncio.get_running_loop()
        try:
            pcm = await loop.run_in_executor(None, decode_audio, data, MAX_SECONDS)
        except AudioTooLong:
            raise HTTPException(status_code=422, detail="audio trop long")
        except AudioInvalid:
            raise HTTPException(status_code=422, detail="audio indécodable")
        try:
            waited = await sched.acquire(priority)
        except Busy as b:
            return JSONResponse({"error": "busy"}, status_code=503, headers={"Retry-After": str(b.retry_after)})
        t0 = time.monotonic()
        try:
            text = await loop.run_in_executor(pool, state["transcriber"].transcribe, pcm, language, prompt)
        finally:
            sched.release(priority)
        processing = time.monotonic() - t0
        audio_seconds = len(pcm) / SAMPLE_RATE
        # Jamais le texte ni le prompt dans les logs (données de santé)
        log.info("transcribe priority=%s audio=%.1fs processing=%.1fs wait=%.1fs", priority, audio_seconds, processing, waited)
        return {"text": text, "audio_seconds": round(audio_seconds, 2), "processing_seconds": round(processing, 2), "model": model_name}

    return app


app = create_app()
