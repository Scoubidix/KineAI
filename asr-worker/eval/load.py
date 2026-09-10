r"""Charge simultanée sur le worker : N transcriptions de séance (priorité batch, segments de 45 s
envoyés en continu) pendant que M kinés dictent (priorité interactive, un segment de 20 s toutes les
20 s, comme une vraie dictée). Mesure ce que voit chaque kiné : délai de réponse par segment.

Usage : .venv\Scripts\python.exe eval/load.py [--url http://localhost:8100] [--token dev-token]
        [--sessions 2] [--dictations 1] [--duration 120]
Audio : tranches de eval/audio/dictee-01_clean.wav (générer avec gen_dictation.py).
"""
import argparse, io, os, statistics, threading, time, wave

import httpx

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE = os.path.join(HERE, "audio", "dictee-01_clean.wav")


def slice_wav(path, start_s, length_s):
    with wave.open(path) as w:
        rate = w.getframerate()
        w.setpos(int(start_s * rate))
        frames = w.readframes(int(length_s * rate))
    buf = io.BytesIO()
    with wave.open(buf, "wb") as o:
        o.setnchannels(1); o.setsampwidth(2); o.setframerate(rate); o.writeframes(frames)
    return buf.getvalue()


def client(name, priority, data, interval, stop_at, url, token, results):
    """Envoie un segment, attend `interval` s après l'envoi (0 = enchaîner), jusqu'à stop_at."""
    with httpx.Client(timeout=300) as http:
        while time.time() < stop_at:
            t0 = time.time()
            try:
                r = http.post(f"{url}/v1/transcribe", headers={"Authorization": f"Bearer {token}"},
                              files={"audio": ("s.wav", data, "audio/wav")},
                              data={"language": "fr", "priority": priority})
                status = r.status_code
            except httpx.HTTPError as e:
                status = f"ERR {type(e).__name__}"
            results.append((name, priority, status, time.time() - t0))
            if interval:
                time.sleep(max(0.0, interval - (time.time() - t0)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://localhost:8100")
    ap.add_argument("--token", default=os.environ.get("ASR_WORKER_TOKEN", "dev-token"))
    ap.add_argument("--sessions", type=int, default=2)
    ap.add_argument("--dictations", type=int, default=1)
    ap.add_argument("--duration", type=int, default=120)
    a = ap.parse_args()
    batch_audio = slice_wav(SOURCE, 0, 45)
    dict_audio = slice_wav(SOURCE, 45, 20)
    results = []
    stop_at = time.time() + a.duration
    threads = [threading.Thread(target=client, args=(f"séance {i + 1}", "batch", batch_audio, 0, stop_at, a.url, a.token, results)) for i in range(a.sessions)]
    threads += [threading.Thread(target=client, args=(f"dictée {i + 1}", "interactive", dict_audio, 20, stop_at, a.url, a.token, results)) for i in range(a.dictations)]
    print(f"{a.sessions} séance(s) batch en continu + {a.dictations} dictée(s) interactive, {a.duration} s…")
    for t in threads: t.start()
    while any(t.is_alive() for t in threads):
        time.sleep(10)
        try:
            h = httpx.get(f"{a.url}/healthz", timeout=5).json()
            print(f"  healthz busy={h.get('busy')} queued={h.get('queued')}")
        except httpx.HTTPError:
            print("  healthz injoignable")
    for t in threads: t.join()

    print(f"\n{'client':12} {'priorité':12} {'n':>3} {'200':>4} {'503':>4} {'p50 s':>7} {'p95 s':>7} {'max s':>7}")
    for name in sorted({r[0] for r in results}):
        rows = [r for r in results if r[0] == name]
        ok = [r[3] for r in rows if r[2] == 200]
        busy = sum(1 for r in rows if r[2] == 503)
        p50 = statistics.median(ok) if ok else float("nan")
        p95 = sorted(ok)[int(len(ok) * 0.95) - 1] if len(ok) >= 2 else (ok[0] if ok else float("nan"))
        print(f"{name:12} {rows[0][1]:12} {len(rows):3} {len(ok):4} {busy:4} {p50:7.1f} {p95:7.1f} {max(ok) if ok else float('nan'):7.1f}")
    print("\nLecture : la dictée doit rester sous ~20 s par segment de 20 s (le kiné ne voit que le dernier segment) ;")
    print("les séances peuvent attendre. Un 503 sur la dictée = file saturée plus de ASR_INTERACTIVE_WAIT_MAX s.")


if __name__ == "__main__":
    main()
