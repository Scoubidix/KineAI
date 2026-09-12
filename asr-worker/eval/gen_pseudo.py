r"""Dix clips très courts (< 20 s) pour éprouver la pseudonymisation : noms, dates de naissance, téléphone,
e-mail, adresse, tiers, kiné, mode libre, nom-mot-courant, éponymes. Synthèse edge-tts puis transcription
en local (même modèle que le worker), sans réseau vers Hugging Face si ASR_MODEL_PATH + HF_HUB_OFFLINE=1.

Usage : .venv\Scripts\python.exe eval/gen_pseudo.py            # synthèse + transcription
        .venv\Scripts\python.exe eval/gen_pseudo.py --no-asr   # synthèse seule
Sorties : eval/audio/pseudo/pseudo-NN.wav et eval/out/pseudo-NN.txt. Corpus synthétique : aucun nom réel.
"""
import asyncio, os, subprocess, sys, tempfile

import edge_tts

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, ".."))
FFMPEG = os.path.join(HERE, "..", "..", "backend", "node_modules", "@ffmpeg-installer", "win32-x64", "ffmpeg.exe")
VOICE, RATE = "fr-FR-HenriNeural", "+2%"
PROMPT = ("Bilan kinésithérapique. Lasègue, Schober, Lachman, Neer, Jobe, Hawkins, Spurling, Phalen, Tinel, EVA, "
          "Thompson, Kleiger, flexion, extension, abduction, rotation, testing quatre sur cinq, DN4, Jamar, "
          "knee to wall, ischio-jambiers, fibulaires, paravertébraux, kinésiophobie, DIDT, LLE.")

# (identifiant, texte dit) — chaque clip vise un mécanisme du dictionnaire
CLIPS = [
    ("pseudo-01", "Bonjour madame Martin, alors Sophie, comment va votre dos depuis la dernière fois ? Vous avez quarante-six ans, vous êtes coiffeuse."),
    ("pseudo-02", "Patiente née le trois mars mille neuf cent quatre-vingt, suivie pour une lombalgie depuis trois mois. EVA à quatre au repos."),
    ("pseudo-03", "Je vous rappelle au zéro six douze trente-quatre cinquante-six soixante-dix-huit, ou par mail à sophie point martin arobase gmail point com."),
    ("pseudo-04", "Vous habitez toujours au douze rue des Lilas à Lyon ? Le cabinet est à dix minutes à pied, ça vous fera un peu de marche."),
    ("pseudo-05", "Vous êtes adressée par le docteur Lefèvre pour votre épaule droite. Votre fils Lucas vous accompagne aujourd'hui, il a dix ans."),
    ("pseudo-06", "Bonjour, je suis Valentin Durand, kinésithérapeute. Monsieur Delcourt, installez-vous, on va regarder cette épaule opérée il y a huit semaines."),
    ("pseudo-07", "Bonjour monsieur Berthier, entorse de cheville gauche il y a dix jours, mécanisme en varus forcé. Radio aux urgences normale, critères d'Ottawa négatifs."),
    ("pseudo-08", "Monsieur Petit, un petit gonflement persiste au genou droit, mais la flexion progresse bien, cent dix degrés aujourd'hui."),
    ("pseudo-09", "Numéro de sécurité sociale un quatre-vingt-trois zéro trois soixante-quinze cent seize zéro zéro un quarante-deux, dossier quarante-huit mille deux cent treize."),
    ("pseudo-10", "Test de Lachman négatif, Lasègue négatif des deux côtés, méthode McKenzie à domicile. Madame Rosier, vous refaites les exercices trois fois par jour."),
]


def ff(*args):
    subprocess.run([FFMPEG, "-y", "-loglevel", "error", *args], check=True)


async def synth_all(audio_dir):
    sem = asyncio.Semaphore(4)

    async def one(name, text):
        with tempfile.TemporaryDirectory() as tmp:
            mp3 = os.path.join(tmp, "clip.mp3")
            async with sem:
                await edge_tts.Communicate(text, VOICE, rate=RATE).save(mp3)
            wav = os.path.join(audio_dir, f"{name}.wav")
            ff("-i", mp3, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", wav)
        return wav

    return await asyncio.gather(*(one(n, t) for n, t in CLIPS))


def main():
    audio_dir = os.path.join(HERE, "audio", "pseudo")
    out_dir = os.path.join(HERE, "out")
    os.makedirs(audio_dir, exist_ok=True)
    os.makedirs(out_dir, exist_ok=True)
    wavs = asyncio.run(synth_all(audio_dir))
    print(f"{len(wavs)} clips synthétisés dans {audio_dir}")
    if "--no-asr" in sys.argv:
        return
    from transcriber import Transcriber, decode_audio
    t = Transcriber(threads=int(os.environ.get("ASR_THREADS", "4")), model_path=os.environ.get("ASR_MODEL_PATH") or None)
    for (name, _), wav in zip(CLIPS, wavs):
        with open(wav, "rb") as f:
            data = f.read()
        hyp = t.transcribe(decode_audio(data, 60), "fr", PROMPT).strip()
        with open(os.path.join(out_dir, f"{name}.txt"), "w", encoding="utf-8") as f:
            f.write(hyp + "\n")
        print(f"{name}: {hyp}")


if __name__ == "__main__":
    main()
