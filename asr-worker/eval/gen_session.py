r"""Génère les audios de séance : eval/audio/<nom>_clean.wav (deux voix, 16 kHz mono) et <nom>_cabinet.wav
(bruit rose, réverb, micro posé sur la table). Les scripts sont des dialogues : « K: … » (kiné), « P: … » (patient),
ligne vide = pause longue (changement de temps de la séance).

Usage : .venv\Scripts\python.exe eval/gen_session.py [seance-03]   (sans argument : les cinq)
"""
import asyncio, glob, os, subprocess, sys, tempfile

import edge_tts

HERE = os.path.dirname(os.path.abspath(__file__))
FFMPEG = os.path.join(HERE, "..", "..", "backend", "node_modules", "@ffmpeg-installer", "win32-x64", "ffmpeg.exe")
RATE = "+2%"
# Voix par rôle ; les séances paires inversent les genres pour couvrir kiné femme / patient homme
VOICES = {
    "default": {"K": "fr-FR-HenriNeural", "P": "fr-FR-DeniseNeural"},
    "swapped": {"K": "fr-FR-VivienneMultilingualNeural", "P": "fr-FR-RemyMultilingualNeural"},
}
PAUSE_TURN, PAUSE_PARA = 0.8, 2.0


def ff(*args):
    subprocess.run([FFMPEG, "-y", "-loglevel", "error", *args], check=True)


def parse(path):
    """Liste de (rôle, texte, pause après) ; ligne vide = pause longue sur la réplique précédente."""
    out = []
    for raw in open(path, encoding="utf-8").read().split("\n"):
        line = raw.strip()
        if not line:
            if out:
                r, t, _ = out[-1]
                out[-1] = (r, t, PAUSE_PARA)
            continue
        if len(line) < 3 or line[1] != ":" or line[0] not in ("K", "P"):
            raise SystemExit(f"{path} : ligne sans préfixe K:/P: → {line[:40]!r}")
        out.append((line[0], line[2:].strip(), PAUSE_TURN))
    return out


def voices_for(base):
    number = int(base.rsplit("-", 1)[-1])
    return VOICES["swapped"] if number % 2 == 0 else VOICES["default"]


async def synth(lines, voices, workdir):
    sem = asyncio.Semaphore(4)

    async def one(i, role, text):
        mp3 = os.path.join(workdir, f"{i:03d}.mp3")
        async with sem:
            await edge_tts.Communicate(text, voices[role], rate=RATE).save(mp3)
        wav = os.path.join(workdir, f"{i:03d}.wav")
        ff("-i", mp3, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", wav)
        return wav

    return await asyncio.gather(*(one(i, r, t) for i, (r, t, _) in enumerate(lines)))


def generate(script):
    base = os.path.splitext(os.path.basename(script))[0]
    lines = parse(script)
    audio_dir = os.path.join(HERE, "audio")
    os.makedirs(audio_dir, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        wavs = asyncio.run(synth(lines, voices_for(base), tmp))
        silences = {}
        for d in (PAUSE_TURN, PAUSE_PARA):
            p = os.path.join(tmp, f"sil_{d}.wav")
            ff("-f", "lavfi", "-i", "anullsrc=r=16000:cl=mono", "-t", str(d), "-c:a", "pcm_s16le", p)
            silences[d] = p
        concat = os.path.join(tmp, "list.txt")
        with open(concat, "w", encoding="utf-8") as f:
            for w, (_, _, pause) in zip(wavs, lines):
                f.write(f"file '{w}'\nfile '{silences[pause]}'\n")
        clean = os.path.join(audio_dir, f"{base}_clean.wav")
        ff("-f", "concat", "-safe", "0", "-i", concat, "-c:a", "pcm_s16le", clean)
        # Micro posé sur la table : plus de réverb et de bruit que la dictée tenue près de la bouche
        cabinet = os.path.join(audio_dir, f"{base}_cabinet.wav")
        ff("-i", clean, "-f", "lavfi", "-i", "anoisesrc=color=pink:sample_rate=16000:amplitude=0.03",
           "-filter_complex",
           "[0:a]volume=0.6,aecho=0.8:0.6:40|70:0.3|0.15,lowpass=f=5000,highpass=f=150[v];[v][1:a]amix=inputs=2:duration=first,volume=3.4[out]",
           "-map", "[out]", "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", cabinet)
    print("OK :", clean, cabinet)


if __name__ == "__main__":
    names = sys.argv[1:] or [os.path.basename(p)[:-4] for p in sorted(glob.glob(os.path.join(HERE, "sessions", "seance-*.txt")))]
    for n in names:
        generate(os.path.join(HERE, "sessions", f"{n}.txt"))
