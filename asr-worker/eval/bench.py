"""Bench de la dictée : WER, RTF, termes kiné, par fichier de eval/audio (et eval/audio/real s'il existe).

Usage : .venv\Scripts\python.exe eval/bench.py [--url http://localhost:8100 --token dev-token] [--concurrency 4] [--only dictee-03]
Sans --url : appel direct du Transcriber (in-process). Écrit eval/out/<nom>_<variante>.txt.
"""
import argparse, glob, os, re, sys, threading, time, wave

import jiwer

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, ".."))

PROMPT = ("Bilan kinésithérapique. EVA, Lasègue, Schober, Lachman, Neer, Jobe, Hawkins, Spurling, Phalen, Tinel, "
          "Thompson, Kleiger, flexion, extension, abduction, rotation, testing quatre sur cinq, DN4, Jamar, "
          "knee to wall, ischio-jambiers, fibulaires, paravertébraux, kinésiophobie, DIDT, LLE.")
TERMES = ["lasègue", "schober", "sorensen", "mckenzie", "kinésiophobie", "supra-épineux", "didt", "lachman",
          "spurling", "phalen", "tinel", "jamar", "dn4", "kleiger", "thompson", "knee to wall", "fibulaires", "ottawa"]
norm = jiwer.Compose([jiwer.ToLowerCase(), jiwer.RemovePunctuation(), jiwer.RemoveMultipleSpaces(), jiwer.Strip()])


def duration(path):
    with wave.open(path) as w:
        return w.getnframes() / w.getframerate()


def split_segments(path, seconds=45.0):
    """Le worker refuse plus de 60 s : le bench découpe comme le navigateur (tranches de 45 s) et concatène."""
    import io
    out = []
    with wave.open(path) as w:
        rate, n = w.getframerate(), w.getnframes()
        step = int(seconds * rate)
        for start in range(0, n, step):
            w.setpos(start)
            frames = w.readframes(min(step, n - start))
            buf = io.BytesIO()
            with wave.open(buf, "wb") as o:
                o.setnchannels(1); o.setsampwidth(2); o.setframerate(rate); o.writeframes(frames)
            out.append(buf.getvalue())
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url"); ap.add_argument("--token", default=os.environ.get("ASR_WORKER_TOKEN", "dev-token"))
    ap.add_argument("--concurrency", type=int, default=1); ap.add_argument("--only")
    a = ap.parse_args()
    files = sorted(glob.glob(os.path.join(HERE, "audio", "*.wav")) + glob.glob(os.path.join(HERE, "audio", "real", "*.wav")))
    if a.only:
        files = [f for f in files if a.only in os.path.basename(f)]
    os.makedirs(os.path.join(HERE, "out"), exist_ok=True)
    if a.url:
        import httpx, tempfile
        run_bytes = lambda data: httpx.post(f"{a.url}/v1/transcribe", headers={"Authorization": f"Bearer {a.token}"},
                                            files={"audio": ("seg.wav", data, "audio/wav")},
                                            data={"language": "fr", "prompt": PROMPT, "priority": "interactive"}, timeout=120).json()["text"]
    else:
        from transcriber import Transcriber, decode_audio
        t = Transcriber(threads=int(os.environ.get("ASR_THREADS", "2")))
        run_bytes = lambda data: t.transcribe(decode_audio(data, 10_000), "fr", PROMPT)

    print(f"{'fichier':28} {'audio':>6} {'temps':>6} {'RTF':>5} {'WER':>6} termes")
    for path in files:
        name = os.path.basename(path)[:-4]
        ref_name = re.sub(r"_(clean|cabinet)$", "", name)
        ref = open(os.path.join(HERE, "scripts", f"{ref_name}.txt"), encoding="utf-8").read()
        segs = split_segments(path)
        results = [None] * len(segs)
        t0 = time.time()
        if a.concurrency > 1 and a.url:
            def work(i):
                results[i] = run_bytes(segs[i])
            threads = [threading.Thread(target=work, args=(i,)) for i in range(len(segs))]
            for th in threads: th.start()
            for th in threads: th.join()
        else:
            for i, s in enumerate(segs):
                results[i] = run_bytes(s)
        dt = time.time() - t0
        hyp = " ".join(r.strip() for r in results)
        d = duration(path)
        wer = jiwer.wer(norm(" ".join(ref.split())), norm(" ".join(hyp.split())))
        low = hyp.lower()
        hits = sum(1 for term in TERMES if term in low)
        print(f"{name:28} {d:6.0f} {dt:6.0f} {dt / d:5.2f} {wer:6.1%} {hits}/{len(TERMES)}")
        with open(os.path.join(HERE, "out", f"{name}.txt"), "w", encoding="utf-8") as f:
            f.write(hyp + "\n")


if __name__ == "__main__":
    main()
