r"""Bench de la dictée : WER, RTF, termes kiné, par fichier de eval/audio (et eval/audio/real s'il existe).

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

# --- Normalisation des nombres en lettres → chiffres, avant calcul du WER ---
# Whisper transcrit les nombres en chiffres ("52 ans") alors que la référence dictée
# les a en toutes lettres ("cinquante-deux ans") : sans cette normalisation, chaque
# nombre dicté compte comme une erreur de WER indépendamment de la qualité réelle.
UNITS = {
    "zéro": 0, "un": 1, "une": 1, "deux": 2, "trois": 3, "quatre": 4, "cinq": 5,
    "six": 6, "sept": 7, "huit": 8, "neuf": 9, "dix": 10, "onze": 11, "douze": 12,
    "treize": 13, "quatorze": 14, "quinze": 15, "seize": 16,
}
TENS = {"vingt": 20, "trente": 30, "quarante": 40, "cinquante": 50, "soixante": 60}
UNIT_WORDS = {"degré", "degrés", "centimètre", "centimètres", "kilo", "kilos", "seconde", "secondes",
              "semaine", "semaines", "mois", "fois", "sur"}


def _parse_extension(words, i):
    """Unité qui suit une dizaine ou quatre-vingt : dix-sept/huit/neuf (17-19) combinés, sinon un mot seul."""
    n = len(words)
    if i >= n:
        return None, i
    if words[i] == "dix" and i + 1 < n and words[i + 1] in ("sept", "huit", "neuf"):
        return 10 + UNITS[words[i + 1]], i + 2
    if words[i] in UNITS:
        return UNITS[words[i]], i + 1
    return None, i


def _parse_tens_units(words, i):
    """Dizaine (+ unité) à partir de i : vingt-cinq, quatre-vingt-dix, soixante-dix-huit, quarante et un..."""
    n = len(words)
    if i >= n:
        return None, i
    w = words[i]
    if w == "quatre" and i + 1 < n and words[i + 1] in ("vingt", "vingts"):
        base, j = 80, i + 2
        ext, j2 = _parse_extension(words, j)
        if ext is not None:
            base, j = base + ext, j2
        return base, j
    if w in TENS:
        base, j = TENS[w], i + 1
        if j < n and words[j] == "et" and j + 1 < n and words[j + 1] in ("un", "une", "onze"):
            return base + (1 if words[j + 1] in ("un", "une") else 11), j + 2
        ext, j2 = _parse_extension(words, j)
        if ext is not None:
            base, j = base + ext, j2
        return base, j
    if w == "dix" and i + 1 < n and words[i + 1] in ("sept", "huit", "neuf"):
        return 10 + UNITS[words[i + 1]], i + 2
    if w in UNITS:
        return UNITS[w], i + 1
    return None, i


def _parse_up_to_999(words, i):
    """Centaines + dizaine/unité à partir de i : cent, cent vingt, cent soixante-dix, deux cents..."""
    n = len(words)
    value, j, consumed = 0, i, False
    if j < n and words[j] in UNITS and 1 <= UNITS[words[j]] <= 9 and j + 1 < n and words[j + 1] in ("cent", "cents"):
        value, j, consumed = UNITS[words[j]] * 100, j + 2, True
    elif j < n and words[j] in ("cent", "cents"):
        value, j, consumed = 100, j + 1, True
    tv, j2 = _parse_tens_units(words, j)
    if tv is not None:
        value, j, consumed = value + tv, j2, True
    if not consumed:
        return None, i
    return value, j


def _parse_number_phrase(words, i):
    """Nombre complet à partir de i, avec milliers pour les années : deux mille dix-huit → 2018 ;
    "mille" seul (sans multiplicateur) → 1000."""
    n = len(words)
    mult, j2 = _parse_up_to_999(words, i)
    if mult is not None and j2 < n and words[j2] == "mille":
        total, j = (mult or 1) * 1000, j2 + 1
        rest, j3 = _parse_up_to_999(words, j)
        if rest:
            total, j = total + rest, j3
        return total, j
    if i < n and words[i] == "mille":
        total, j = 1000, i + 1
        rest, j3 = _parse_up_to_999(words, j)
        if rest:
            total, j = total + rest, j3
        return total, j
    rest, j3 = _parse_up_to_999(words, i)
    if rest is None:
        return None, i
    return rest, j3


def normalize_numbers(text: str) -> str:
    """Réécrit les nombres en toutes lettres en chiffres. `un`/`une` ne sont convertis que juste
    avant un mot d'unité (degré, centimètre, kilo, seconde, semaine, mois, fois, sur) — ailleurs
    ce sont des articles, jamais des nombres."""
    tokens = list(re.finditer(r"[a-zà-ÿ]+", text))
    words = [m.group(0) for m in tokens]
    n = len(words)
    replacements = []
    i = 0
    while i < n:
        w = words[i]
        if w in ("un", "une"):
            if i + 1 < n and words[i + 1] in UNIT_WORDS:
                replacements.append((tokens[i].start(), tokens[i].end(), "1"))
            i += 1
            continue
        if w in UNITS or w in TENS or w in ("cent", "cents", "mille"):
            value, j = _parse_number_phrase(words, i)
            if value is not None and j > i:
                replacements.append((tokens[i].start(), tokens[j - 1].end(), str(value)))
                i = j
                continue
        i += 1
    if not replacements:
        return text
    out, pos = [], 0
    for start, end, rep in replacements:
        out.append(text[pos:start])
        out.append(rep)
        pos = end
    out.append(text[pos:])
    return "".join(out)


norm = jiwer.Compose([jiwer.ToLowerCase(), normalize_numbers, jiwer.RemovePunctuation(), jiwer.RemoveMultipleSpaces(), jiwer.Strip()])
norm_raw = jiwer.Compose([jiwer.ToLowerCase(), jiwer.RemovePunctuation(), jiwer.RemoveMultipleSpaces(), jiwer.Strip()])


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


def reference_text(ref_name):
    """Texte de référence : dictée (scripts/) telle quelle, séance (sessions/) sans les préfixes K:/P:."""
    if ref_name.startswith("seance-"):
        lines = open(os.path.join(HERE, "sessions", f"{ref_name}.txt"), encoding="utf-8").read().split("\n")
        return " ".join(l.strip()[2:].strip() for l in lines if l.strip()[:2] in ("K:", "P:"))
    return open(os.path.join(HERE, "scripts", f"{ref_name}.txt"), encoding="utf-8").read()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url"); ap.add_argument("--token", default=os.environ.get("ASR_WORKER_TOKEN", "dev-token"))
    ap.add_argument("--concurrency", type=int, default=1); ap.add_argument("--only")
    ap.add_argument("--selftest", action="store_true", help="Vérifie normalize_numbers puis quitte, sans lancer le bench.")
    a = ap.parse_args()
    if a.selftest:
        assert normalize_numbers(
            "cinquante-deux ans, deux mille dix-huit, cent vingt degrés, quatre-vingt-dix, un degré, une fois, un carton, mille"
        ) == "52 ans, 2018, 120 degrés, 90, 1 degré, 1 fois, un carton, 1000"
        assert reference_text("seance-01").startswith("Bonjour madame Martin")
        print("selftest ok")
        return
    files = sorted(glob.glob(os.path.join(HERE, "audio", "*.wav")) + glob.glob(os.path.join(HERE, "audio", "real", "*.wav")))
    if a.only:
        files = [f for f in files if a.only in os.path.basename(f)]
    os.makedirs(os.path.join(HERE, "out"), exist_ok=True)
    if a.url:
        import httpx
        run_bytes = lambda data: httpx.post(f"{a.url}/v1/transcribe", headers={"Authorization": f"Bearer {a.token}"},
                                            files={"audio": ("seg.wav", data, "audio/wav")},
                                            data={"language": "fr", "prompt": PROMPT, "priority": "interactive"}, timeout=120).json()["text"]
    else:
        from transcriber import Transcriber, decode_audio
        t = Transcriber(threads=int(os.environ.get("ASR_THREADS", "2")))
        run_bytes = lambda data: t.transcribe(decode_audio(data, 10_000), "fr", PROMPT)

    print(f"{'fichier':28} {'audio':>6} {'temps':>6} {'RTF':>5} {'WER':>6} {'WER brut':>9} termes")
    for path in files:
        name = os.path.basename(path)[:-4]
        ref_name = re.sub(r"_(clean|cabinet)$", "", name)
        ref = reference_text(ref_name)
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
        ref_j, hyp_j = " ".join(ref.split()), " ".join(hyp.split())
        wer = jiwer.wer(norm(ref_j), norm(hyp_j))
        wer_brut = jiwer.wer(norm_raw(ref_j), norm_raw(hyp_j))
        low = hyp.lower()
        hits = sum(1 for term in TERMES if term in low)
        print(f"{name:28} {d:6.0f} {dt:6.0f} {dt / d:5.2f} {wer:6.1%} {wer_brut:9.1%} {hits}/{len(TERMES)}")
        with open(os.path.join(HERE, "out", f"{name}.txt"), "w", encoding="utf-8") as f:
            f.write(hyp + "\n")


if __name__ == "__main__":
    main()
