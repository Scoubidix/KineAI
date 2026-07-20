'use client';

/**
 * Page patient télésoin — accès public via JWT dans l'URL.
 * Pas de Firebase, pas de fetchWithAuth : le token JWT est dans l'URL.
 *
 * Machine à états :
 *  loading       → Appel GET /api/visio/session/:token
 *  error         → Lien invalide / expiré / annulé (401/403/réseau)
 *  info          → Écran d'information télésoin (si !patientInfoAcknowledged)
 *  waiting       → Salle d'attente (useVisioRoom actif, state idle/waiting)
 *  in-call       → En séance (state connecting/connected)
 *  ended         → Séance terminée
 *  failed        → Connexion impossible
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  WifiOff,
  Camera,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useVisioRoom, mediaErrorMessage } from '@/hooks/useVisioRoom';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SessionData {
  seanceId: number;
  scheduledAt: string;
  status: 'SCHEDULED' | 'LIVE' | 'ENDED' | 'CANCELLED';
  patientInfoAcknowledged: boolean;
}

type PageState = 'loading' | 'error' | 'info' | 'waiting' | 'in-call' | 'ended' | 'failed' | 'left';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ---------------------------------------------------------------------------
// VideoTile — affiche une MediaStream dans un <video>
// ---------------------------------------------------------------------------

interface VideoTileProps {
  stream: MediaStream | null;
  muted?: boolean;
  className?: string;
  label?: string;
  fit?: 'cover' | 'contain';
}

function VideoTile({ stream, muted = false, className = '', label, fit = 'cover' }: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (stream) {
      video.srcObject = stream;
    } else {
      video.srcObject = null;
    }
  }, [stream]);

  return (
    <div className={`relative overflow-hidden rounded-xl bg-zinc-900 ${className}`}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        className={`h-full w-full ${fit === 'contain' ? 'object-contain' : 'object-cover'}`}
      />
      {label && (
        <span className="absolute bottom-2 left-2 rounded bg-black/50 px-2 py-0.5 text-xs text-white">
          {label}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Composant interne : Salle d'attente + Room (useVisioRoom actif)
// ---------------------------------------------------------------------------

interface RoomProps {
  seanceId: number;
  token: string;
  scheduledAt: string;
  onEnded: () => void;
  onFailed: () => void;
  onLeave: () => void;
}

function VisioRoom({ seanceId, token, scheduledAt, onEnded, onFailed, onLeave }: RoomProps) {
  const { localStream, remoteStream, state, retryCount, mediaError, mediaErrorReason } = useVisioRoom({
    role: 'PATIENT',
    seanceId,
    token,
  });

  // Contrôles micro / caméra
  const [micEnabled, setMicEnabled] = useState(true);
  const [camEnabled, setCamEnabled] = useState(true);

  // Bip + animation d'entrée en séance (une seule fois)
  const beepedRef = useRef(false);
  const [flashConnected, setFlashConnected] = useState(false);

  // Callbacks vers la page parente
  const onEndedRef = useRef(onEnded);
  const onFailedRef = useRef(onFailed);
  const onLeaveRef = useRef(onLeave);
  onEndedRef.current = onEnded;
  onFailedRef.current = onFailed;
  onLeaveRef.current = onLeave;

  useEffect(() => {
    if (state === 'ended') {
      onEndedRef.current();
    }
    if (state === 'failed' && !mediaError) {
      onFailedRef.current();
    }
  }, [state, mediaError]);

  // Bip d'entrée en séance
  useEffect(() => {
    if (state === 'connected' && !beepedRef.current) {
      beepedRef.current = true;
      setFlashConnected(true);
      setTimeout(() => setFlashConnected(false), 800);
      try {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.4);
      } catch {
        // AudioContext non dispo (ex. Safari avec autoplay bloqué) : ignorer
      }
    }
  }, [state]);

  // Toggle micro
  const toggleMic = useCallback(() => {
    if (!localStream) return;
    const enabled = !micEnabled;
    localStream.getAudioTracks().forEach((t) => {
      t.enabled = enabled;
    });
    setMicEnabled(enabled);
  }, [localStream, micEnabled]);

  // Toggle caméra
  const toggleCam = useCallback(() => {
    if (!localStream) return;
    const enabled = !camEnabled;
    localStream.getVideoTracks().forEach((t) => {
      t.enabled = enabled;
    });
    setCamEnabled(enabled);
  }, [localStream, camEnabled]);

  // Quitter la séance : le patient QUITTE la salle mais ne termine PAS la consultation.
  // Il pourra re-rejoindre tant que le kiné n'a pas terminé. (Le démontage du composant
  // déclenche le cleanup du hook → déconnexion socket → 'peer-left' côté kiné.)
  const handleLeave = useCallback(() => {
    onLeaveRef.current();
  }, []);

  // Erreur d'accès caméra/micro
  if (mediaError) {
    return (
      <CenteredCard
        icon={<Camera className="h-10 w-10 text-amber-500" />}
        title={mediaErrorReason === 'notfound' ? 'Aucun périphérique' : 'Accès caméra/micro'}
      >
        <p className="text-center text-muted-foreground">
          {mediaErrorMessage(mediaErrorReason ?? 'other')}
        </p>
      </CenteredCard>
    );
  }

  const inCall = state === 'connecting' || state === 'connected';

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-white">
      {/* Zone vidéo */}
      {inCall ? (
        <div className={`relative flex-1 ${flashConnected ? 'animate-pulse' : ''}`}>
          {/* Vidéo distante (praticien) */}
          <VideoTile
            stream={remoteStream}
            className="h-full w-full"
            label="Votre praticien"
            fit="contain"
          />
          {/* Vidéo locale (patient) — muted obligatoire */}
          <div className="absolute bottom-4 right-4 h-32 w-24 shadow-lg sm:h-40 sm:w-28">
            <VideoTile stream={localStream} muted className="h-full w-full" label="Vous" />
          </div>

          {/* Overlay état */}
          {state === 'connecting' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-white" />
                <p className="text-sm text-white">Connexion en cours…</p>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Salle d'attente */
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="flex flex-col items-center gap-6 text-center">
            <>
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-blue-500/20 ring-4 ring-blue-500/30">
                <Clock className="h-10 w-10 text-blue-400" />
              </div>
              <div className="space-y-2">
                <p className="text-lg font-medium text-zinc-100">
                  Votre séance est prévue à {formatTime(scheduledAt)}.
                </p>
                <p className="text-zinc-400">En attente de votre praticien…</p>
              </div>
              <div className="flex items-center gap-2 text-sm text-zinc-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Connecté à la salle</span>
              </div>
            </>
          </div>
        </div>
      )}

      {/* Message retry */}
      {state === 'connecting' && retryCount > 0 && (
        <div className="flex items-center justify-center gap-2 bg-amber-500/10 px-4 py-2 text-sm text-amber-400">
          <WifiOff className="h-4 w-4" />
          Connexion instable, nouvelle tentative… (essai {retryCount}/3)
        </div>
      )}

      {/* Barre de contrôles */}
      <div className="flex items-center justify-center gap-4 bg-zinc-900 px-4 py-4">
        <button
          onClick={toggleMic}
          aria-label={micEnabled ? 'Couper le micro' : 'Activer le micro'}
          className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors ${
            micEnabled ? 'bg-zinc-700 hover:bg-zinc-600' : 'bg-red-600 hover:bg-red-500'
          }`}
        >
          {micEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
        </button>

        <button
          onClick={toggleCam}
          aria-label={camEnabled ? 'Couper la caméra' : 'Activer la caméra'}
          className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors ${
            camEnabled ? 'bg-zinc-700 hover:bg-zinc-600' : 'bg-red-600 hover:bg-red-500'
          }`}
        >
          {camEnabled ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
        </button>

        <button
          onClick={handleLeave}
          aria-label="Quitter la séance"
          title="Quitter (vous pourrez rejoindre)"
          className="flex h-14 w-14 items-center justify-center rounded-full bg-red-600 transition-colors hover:bg-red-500 active:bg-red-700"
        >
          <PhoneOff className="h-6 w-6" />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper : écran centré générique
// ---------------------------------------------------------------------------

interface CenteredCardProps {
  icon?: React.ReactNode;
  title: string;
  children: React.ReactNode;
}

function CenteredCard({ icon, title, children }: CenteredCardProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 p-4 dark:from-zinc-950 dark:to-zinc-900">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          {icon && <div className="mb-2">{icon}</div>}
          <CardTitle className="text-xl">{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">{children}</CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page principale
// ---------------------------------------------------------------------------

export default function VisioPatientPage() {
  const params = useParams();
  const token = Array.isArray(params.token) ? params.token[0] : (params.token ?? '');

  const [pageState, setPageState] = useState<PageState>('loading');
  const [session, setSession] = useState<SessionData | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [ackLoading, setAckLoading] = useState(false);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? '';

  // ------------------------------------------------------------------
  // Étape 1 : Charger la session
  // ------------------------------------------------------------------
  const loadSession = useCallback(async () => {
    if (!token) {
      setErrorMessage('Lien invalide.');
      setPageState('error');
      return;
    }
    setPageState('loading');
    try {
      const res = await fetch(`${apiUrl}/api/visio/session/${token}`);
      if (!res.ok) {
        // 401 lien expiré/invalide, 403 annulé, etc.
        let msg = 'Lien invalide, expiré ou séance annulée.';
        try {
          const body = await res.json();
          if (body?.error) msg = body.error;
        } catch {
          // ignorer
        }
        setErrorMessage(msg);
        setPageState('error');
        return;
      }

      const data: SessionData = await res.json();
      setSession(data);

      if (data.status === 'CANCELLED' || data.status === 'ENDED') {
        setErrorMessage(
          data.status === 'CANCELLED'
            ? 'Cette séance a été annulée.'
            : 'Cette séance est déjà terminée.'
        );
        setPageState('error');
        return;
      }

      // Choisir l'état initial
      if (!data.patientInfoAcknowledged) {
        setPageState('info');
      } else {
        setPageState('waiting');
      }
    } catch {
      setErrorMessage('Impossible de charger la séance. Vérifie ta connexion internet.');
      setPageState('error');
    }
  }, [token, apiUrl]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  // ------------------------------------------------------------------
  // Étape 2 : Accusé de réception des infos
  // ------------------------------------------------------------------
  const handleAck = useCallback(async () => {
    if (!token) return;
    setAckLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/visio/ack-info/${token}`, {
        method: 'POST',
      });
      if (!res.ok) {
        // En cas d'erreur on laisse passer quand même (UX : pas bloquer le patient)
        console.warn('[VisioPatient] ack-info non 2xx', res.status);
      }
    } catch {
      // Réseau — on continue quand même
    } finally {
      setAckLoading(false);
      setPageState('waiting');
    }
  }, [token, apiUrl]);

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  // ---- Chargement ----
  if (pageState === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 dark:from-zinc-950 dark:to-zinc-900">
        <div className="flex flex-col items-center gap-4 text-muted-foreground">
          <Loader2 className="h-10 w-10 animate-spin" />
          <p className="text-sm">Chargement de votre séance…</p>
        </div>
      </div>
    );
  }

  // ---- Erreur (401/403/annulée/réseau) ----
  if (pageState === 'error') {
    return (
      <CenteredCard
        icon={<AlertTriangle className="h-10 w-10 text-red-500" />}
        title="Lien non disponible"
      >
        <p className="text-center text-muted-foreground">{errorMessage}</p>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          Contactez votre praticien si vous pensez qu'il s'agit d'une erreur.
        </p>
      </CenteredCard>
    );
  }

  // ---- Écran d'information télésoin ----
  if (pageState === 'info') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 p-4 dark:from-zinc-950 dark:to-zinc-900">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle className="text-center text-xl">Avant votre séance de télésoin</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <p className="text-sm text-muted-foreground">
              Merci de prendre connaissance des points suivants :
            </p>
            <ul className="space-y-3">
              {[
                'Vous devez disposer d\'un appareil de vidéotransmission fonctionnel et d\'une bonne connexion internet au moment de la séance.',
                'Installez-vous dans un lieu vous permettant d\'échanger avec votre praticien en toute confidentialité.',
                'Certains motifs ou symptômes ne peuvent pas faire l\'objet d\'un télésoin : en cas d\'urgence ou si votre état de santé le nécessite, contactez les services d\'urgence.',
                'Les modalités de paiement de la séance vous sont communiquées par votre praticien.',
                'Les modalités et conditions de remboursement par l\'Assurance Maladie vous sont précisées par votre praticien.',
              ].map((point, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="mt-0.5 shrink-0 text-primary">•</span>
                  <span>{point}</span>
                </li>
              ))}
            </ul>
            <Button
              onClick={handleAck}
              disabled={ackLoading}
              className="w-full"
              size="lg"
            >
              {ackLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Enregistrement…
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  J'ai lu et compris
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ---- Séance terminée ----
  if (pageState === 'ended') {
    return (
      <CenteredCard
        icon={<CheckCircle2 className="h-10 w-10 text-green-500" />}
        title="Séance terminée"
      >
        <p className="text-center text-muted-foreground">
          Votre séance de télésoin est terminée. Merci et à bientôt&nbsp;!
        </p>
      </CenteredCard>
    );
  }

  // ---- Patient a quitté la séance (peut rejoindre) ----
  if (pageState === 'left') {
    return (
      <CenteredCard
        icon={<PhoneOff className="h-10 w-10 text-zinc-400" />}
        title="Vous avez quitté la séance"
      >
        <p className="text-center text-muted-foreground">
          Vous pouvez rejoindre à nouveau tant que votre praticien n'a pas terminé la consultation.
        </p>
        <Button onClick={() => loadSession()} className="mt-2 w-full" size="lg">
          Rejoindre à nouveau
        </Button>
      </CenteredCard>
    );
  }

  // ---- Connexion impossible ----
  if (pageState === 'failed') {
    return (
      <CenteredCard
        icon={<WifiOff className="h-10 w-10 text-red-500" />}
        title="Connexion impossible"
      >
        <p className="text-center text-muted-foreground">
          Connexion impossible — vérifie ta connexion internet (le wifi fonctionne mieux que la 4G)
          et réessaie.
        </p>
        <Button
          onClick={() => {
            setPageState('waiting');
          }}
          variant="outline"
          className="mt-2 w-full"
        >
          Réessayer
        </Button>
      </CenteredCard>
    );
  }

  // ---- Salle d'attente + Room (waiting / in-call) ----
  if ((pageState === 'waiting' || pageState === 'in-call') && session) {
    return (
      <VisioRoom
        seanceId={session.seanceId}
        token={token}
        scheduledAt={session.scheduledAt}
        onEnded={() => setPageState('ended')}
        onFailed={() => setPageState('failed')}
        onLeave={() => setPageState('left')}
      />
    );
  }

  // Fallback (ne devrait pas arriver)
  return null;
}
