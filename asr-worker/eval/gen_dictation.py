r"""Génère les audios de dictée : eval/audio/<nom>_clean.wav (voix seule, 16 kHz mono) et <nom>_cabinet.wav (bruit rose, réverb, micro éloigné).

Usage : .venv\Scripts\python.exe eval/gen_dictation.py [dictee-03]   (sans argument : les cinq)
"""
import asyncio, glob, os, subprocess, sys, tempfile

import edge_tts

HERE = os.path.dirname(os.path.abspath(__file__))
FFMPEG = os.path.join(HERE, "..", "..", "backend", "node_modules", "@ffmpeg-installer", "win32-x64", "ffmpeg.exe")
VOICE, RATE = "fr-FR-HenriNeural", "+2%"
PAUSE_LINE, PAUSE_PARA = 0.6, 1.4


def ff(*args):
    subprocess.run([FFMPEG, "-y", "-loglevel", "error", *args], check=True)


def parse(path):
    """Liste de (texte, pause après) : ligne vide = paragraphe = pause longue."""
    out = []
    for raw in open(path, encoding="utf-8").read().split("\n"):
        line = raw.strip()
        if not line:
            if out:
                out[-1] = (out[-1][0], PAUSE_PARA)
            continue
        out.append((line, PAUSE_LINE))
    return out


async def synth(lines, workdir):
    sem = asyncio.Semaphore(4)

    async def one(i, text):
        mp3 = os.path.join(workdir, f"{i:03d}.mp3")
        async with sem:
            await edge_tts.Communicate(text, VOICE, rate=RATE).save(mp3)
        wav = os.path.join(workdir, f"{i:03d}.wav")
        ff("-i", mp3, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", wav)
        return wav

    return await asyncio.gather(*(one(i, t) for i, (t, _) in enumerate(lines)))


def generate(script):
    base = os.path.splitext(os.path.basename(script))[0]
    lines = parse(script)
    audio_dir = os.path.join(HERE, "audio")
    os.makedirs(audio_dir, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        wavs = asyncio.run(synth(lines, tmp))
        silences = {}
        for d in (PAUSE_LINE, PAUSE_PARA):
            p = os.path.join(tmp, f"sil_{d}.wav")
            ff("-f", "lavfi", "-i", "anullsrc=r=16000:cl=mono", "-t", str(d), "-c:a", "pcm_s16le", p)
            silences[d] = p
        concat = os.path.join(tmp, "list.txt")
        with open(concat, "w", encoding="utf-8") as f:
            for w, (_, pause) in zip(wavs, lines):
                f.write(f"file '{w}'\nfile '{silences[pause]}'\n")
        clean = os.path.join(audio_dir, f"{base}_clean.wav")
        ff("-f", "concat", "-safe", "0", "-i", concat, "-c:a", "pcm_s16le", clean)
        cabinet = os.path.join(audio_dir, f"{base}_cabinet.wav")
        ff("-i", clean, "-f", "lavfi", "-i", "anoisesrc=color=pink:sample_rate=16000:amplitude=0.02",
           "-filter_complex",
           "[0:a]volume=0.7,aecho=0.8:0.5:30|55:0.25|0.12,lowpass=f=5500,highpass=f=120[v];[v][1:a]amix=inputs=2:duration=first,volume=3.2[out]",
           "-map", "[out]", "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", cabinet)
    print("OK :", clean, cabinet)


if __name__ == "__main__":
    names = sys.argv[1:] or [os.path.basename(p)[:-4] for p in sorted(glob.glob(os.path.join(HERE, "scripts", "dictee-*.txt")))]
    for n in names:
        generate(os.path.join(HERE, "scripts", f"{n}.txt"))
