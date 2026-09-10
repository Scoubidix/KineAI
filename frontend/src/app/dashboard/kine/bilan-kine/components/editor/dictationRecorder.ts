// Micro → segments audio coupés aux silences. Un MediaRecorder par segment (le découpage natif
// `timeslice` produit des morceaux sans en-tête, inutilisables seuls).

export const MIN_SEGMENT_MS = 15_000;
export const MAX_SEGMENT_MS = 45_000;
export const SILENCE_MS = 700;
export const LEVEL_INTERVAL_MS = 100;
const DROP_BELOW_MS = 1_000;
const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];

export interface RecorderCallbacks {
  onSegment: (blob: Blob, index: number) => void;
  onLevel: (level: number) => void;      // 0..1 pour le vumètre
  onTick: (elapsedMs: number) => void;   // chrono de la prise
}

export function pickMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) ?? null;
}

export class DictationRecorder {
  readonly mimeType: string;
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private recorder: MediaRecorder | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private index = 0;
  private takeStart = 0;
  private segmentStart = 0;
  private silenceSince: number | null = null;
  private floorSamples: number[] = [];
  private threshold = 0.008;
  private stopping = false;

  constructor(mimeType: string, private cb: RecorderCallbacks) { this.mimeType = mimeType; }

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.ctx = new AudioContext();
    const source = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    source.connect(this.analyser);
    this.takeStart = Date.now();
    this.startSegment();
    this.timer = setInterval(() => this.sample(), LEVEL_INTERVAL_MS);
  }

  /** Ferme le segment courant (envoyé s'il dure ≥ 1 s) et libère le micro. */
  stop(): void {
    if (this.stopping) return;
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    this.closeSegment(false);
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close();
  }

  private startSegment(): void {
    if (!this.stream) return;
    const rec = new MediaRecorder(this.stream, { mimeType: this.mimeType });
    const startedAt = Date.now();
    const idx = this.index;
    rec.ondataavailable = (e) => {
      if (e.data.size > 0 && Date.now() - startedAt >= DROP_BELOW_MS) this.cb.onSegment(e.data, idx);
    };
    rec.start();
    this.recorder = rec;
    this.segmentStart = startedAt;
    this.silenceSince = null;
    this.index += 1;
  }

  private closeSegment(restart: boolean): void {
    const rec = this.recorder;
    this.recorder = null;
    if (rec && rec.state !== 'inactive') rec.stop();
    if (restart) this.startSegment();
  }

  private sample(): void {
    if (!this.analyser) return;
    const buf = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i += 1) sum += buf[i] * buf[i];
    const rms = Math.sqrt(sum / buf.length);
    const now = Date.now();
    this.cb.onLevel(Math.min(1, rms * 8));
    this.cb.onTick(now - this.takeStart);
    // Plancher de bruit : médiane de la première seconde de la prise
    if (this.floorSamples.length < 10) {
      this.floorSamples.push(rms);
      if (this.floorSamples.length === 10) {
        const sorted = [...this.floorSamples].sort((a, b) => a - b);
        this.threshold = Math.max(sorted[5] * 2, 0.008);
      }
      return;
    }
    const segmentMs = now - this.segmentStart;
    if (rms < this.threshold) this.silenceSince = this.silenceSince ?? now;
    else this.silenceSince = null;
    const silentFor = this.silenceSince === null ? 0 : now - this.silenceSince;
    if (segmentMs >= MAX_SEGMENT_MS || (segmentMs >= MIN_SEGMENT_MS && silentFor >= SILENCE_MS)) this.closeSegment(true);
  }
}
