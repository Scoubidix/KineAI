import io
import os
import struct
import wave

import pytest
from fastapi.testclient import TestClient

os.environ["ASR_WORKER_TOKEN"] = "test-token"
os.environ["ASR_SLOTS"] = "1"

from app import create_app  # noqa: E402

AUTH = {"Authorization": "Bearer test-token"}


def wav_bytes(seconds=1.0, rate=16000):
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate)
        w.writeframes(struct.pack("<h", 0) * int(seconds * rate))
    return buf.getvalue()


class FakeTranscriber:
    model_name = "fake"

    def __init__(self):
        self.calls = []

    def transcribe(self, pcm, language="fr", prompt=""):
        self.calls.append((len(pcm), language, prompt))
        return "texte transcrit"


@pytest.fixture
def client():
    fake = FakeTranscriber()
    app = create_app(lambda: fake)
    with TestClient(app) as c:
        c.fake = fake
        yield c


def test_healthz_ok_once_loaded(client):
    r = client.get("/healthz")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "model": "large-v3-turbo", "slots": 1, "busy": 0, "queued": 0}


def test_transcribe_requires_token(client):
    r = client.post("/v1/transcribe", files={"audio": ("a.wav", wav_bytes(), "audio/wav")})
    assert r.status_code == 401
    r = client.post("/v1/transcribe", files={"audio": ("a.wav", wav_bytes(), "audio/wav")}, headers={"Authorization": "Bearer nope"})
    assert r.status_code == 401


def test_transcribe_returns_text_and_timings(client):
    r = client.post("/v1/transcribe", files={"audio": ("a.wav", wav_bytes(2.0), "audio/wav")},
                    data={"language": "fr", "prompt": "EVA Lasègue", "priority": "interactive"}, headers=AUTH)
    assert r.status_code == 200
    body = r.json()
    assert body["text"] == "texte transcrit"
    assert abs(body["audio_seconds"] - 2.0) < 0.05
    assert body["processing_seconds"] >= 0
    assert body["model"] == "large-v3-turbo"
    assert client.fake.calls[0][1:] == ("fr", "EVA Lasègue")


def test_prompt_is_truncated_to_200_words(client):
    prompt = " ".join(f"mot{i}" for i in range(250))
    r = client.post("/v1/transcribe", files={"audio": ("a.wav", wav_bytes(), "audio/wav")}, data={"prompt": prompt}, headers=AUTH)
    assert r.status_code == 200
    assert client.fake.calls[-1][2].split()[0] == "mot50"


def test_invalid_audio_and_priority(client):
    r = client.post("/v1/transcribe", files={"audio": ("a.bin", b"pas de l'audio", "application/octet-stream")}, headers=AUTH)
    assert r.status_code == 422
    r = client.post("/v1/transcribe", files={"audio": ("a.wav", wav_bytes(), "audio/wav")}, data={"priority": "urgent"}, headers=AUTH)
    assert r.status_code == 422


def test_too_long_audio_is_422(client):
    r = client.post("/v1/transcribe", files={"audio": ("a.wav", wav_bytes(61.0), "audio/wav")}, headers=AUTH)
    assert r.status_code == 422


def test_too_large_body_is_413(client):
    big = b"\0" * (8 * 1024 * 1024 + 1)
    r = client.post("/v1/transcribe", files={"audio": ("a.wav", big, "audio/wav")}, headers=AUTH)
    assert r.status_code == 413


def test_healthz_503_while_loading():
    app = create_app(lambda: FakeTranscriber(), load_on_startup=False)
    with TestClient(app) as c:
        r = c.get("/healthz")
        assert r.status_code == 503
        assert r.json()["status"] == "loading"
        r = c.post("/v1/transcribe", files={"audio": ("a.wav", wav_bytes(), "audio/wav")}, headers=AUTH)
        assert r.status_code == 503 and r.headers["retry-after"] == "10"
