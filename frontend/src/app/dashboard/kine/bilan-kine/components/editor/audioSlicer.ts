// Import d'un fichier audio dans la chaîne de dictée : décodage par le navigateur, mono 16 kHz,
// découpe en tranches de 15 à 45 s coupées au passage le plus silencieux, encodage WAV.
// Chaque tranche est ensuite envoyée exactement comme un segment de micro.

export const TARGET_RATE = 16000;
export const SLICE_MIN_S = 15;
export const SLICE_MAX_S = 45;
const FRAME_S = 0.1;

/** Décode n'importe quel format lu par le navigateur (wav, mp3, m4a, webm, ogg) en float32 mono 16 kHz. */
export async function decodeToMono16k(file: Blob): Promise<Float32Array> {
  const bytes = await file.arrayBuffer();
  const ctx = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(bytes);
  } finally {
    void ctx.close();
  }
  const n = decoded.length;
  const channels = decoded.numberOfChannels;
  const mono = new Float32Array(n);
  for (let c = 0; c < channels; c += 1) {
    const data = decoded.getChannelData(c);
    for (let i = 0; i < n; i += 1) mono[i] += data[i] / channels;
  }
  if (decoded.sampleRate === TARGET_RATE) return mono;
  // Rééchantillonnage par le moteur audio du navigateur
  const length = Math.ceil((n * TARGET_RATE) / decoded.sampleRate);
  const offline = new OfflineAudioContext(1, length, TARGET_RATE);
  const buffer = offline.createBuffer(1, n, decoded.sampleRate);
  buffer.copyToChannel(mono, 0);
  const source = offline.createBufferSource();
  source.buffer = buffer;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0);
}

/**
 * Découpe en tranches : chaque coupe tombe sur la fenêtre de 100 ms la plus silencieuse entre
 * 15 et 45 s après le début de la tranche (comme l'enregistreur coupe aux pauses).
 */
export function sliceAtSilences(pcm: Float32Array, rate = TARGET_RATE, minS = SLICE_MIN_S, maxS = SLICE_MAX_S): Float32Array[] {
  const frame = Math.round(rate * FRAME_S);
  const out: Float32Array[] = [];
  let start = 0;
  while (start < pcm.length) {
    if (pcm.length - start <= maxS * rate) { out.push(pcm.subarray(start)); break; }
    const from = start + minS * rate;
    const to = start + maxS * rate;
    let best = to;
    let bestEnergy = Infinity;
    for (let f = from; f + frame <= to; f += frame) {
      let sum = 0;
      for (let i = f; i < f + frame; i += 1) sum += pcm[i] * pcm[i];
      if (sum < bestEnergy) { bestEnergy = sum; best = f + Math.floor(frame / 2); }
    }
    out.push(pcm.subarray(start, best));
    start = best;
  }
  return out;
}

/** PCM 16 bits mono, en-tête RIFF standard : décodé par le worker comme un enregistrement. */
export function encodeWav(pcm: Float32Array, rate = TARGET_RATE): Blob {
  const buffer = new ArrayBuffer(44 + pcm.length * 2);
  const view = new DataView(buffer);
  const text = (offset: number, s: string) => { for (let i = 0; i < s.length; i += 1) view.setUint8(offset + i, s.charCodeAt(i)); };
  text(0, 'RIFF'); view.setUint32(4, 36 + pcm.length * 2, true); text(8, 'WAVE');
  text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, pcm.length * 2, true);
  let offset = 44;
  for (let i = 0; i < pcm.length; i += 1) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return new Blob([buffer], { type: 'audio/wav' });
}
