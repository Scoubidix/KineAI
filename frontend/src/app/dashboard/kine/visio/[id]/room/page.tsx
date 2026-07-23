'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { getAuth } from 'firebase/auth';
import { app } from '@/lib/firebase/config';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  Loader2,
  UserCheck,
  Clock,
  AlertCircle,
  CheckCircle,
  WifiOff,
  RefreshCw,
  FileText,
  Paperclip,
  Dumbbell,
} from 'lucide-react';
import { getSeance, setConsent, saveCompteRendu, VisioSeance } from '@/lib/visioApi';
import { useVisioRoom, ConnState, mediaErrorMessage } from '@/hooks/useVisioRoom';
import CompteRenduModal from '../../components/CompteRenduModal';
import SendDocumentModal from '../../components/SendDocumentModal';
import { ProgrammeModal, ProgrammeToEdit } from '@/components/ProgrammeModal';
import { fetchWithAuth } from '@/utils/fetchWithAuth';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

// ---------------------------------------------------------------------------
// Helper : vignette vidéo
// ---------------------------------------------------------------------------
function VideoTile({
  stream,
  muted = false,
  label,
  className = '',
  animate = false,
  fit = 'cover',
}: {
  stream: MediaStream | null;
  muted?: boolean;
  label?: string;
  className?: string;
  animate?: boolean;
  fit?: 'cover' | 'contain';
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.srcObject = stream;
  }, [stream]);

  return (
    <div
      className={`relative bg-zinc-900 rounded-xl overflow-hidden flex items-center justify-center ${className} ${
        animate ? 'animate-in fade-in zoom-in-95 duration-500' : ''
      }`}
    >
      {stream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={muted}
          className={`w-full h-full ${fit === 'contain' ? 'object-contain' : 'object-cover'}`}
        />
      ) : (
        <div className="flex flex-col items-center gap-2 text-zinc-500">
          <Video className="h-8 w-8" />
          {label && <span className="text-xs">{label}</span>}
        </div>
      )}
      {label && stream && (
        <span className="absolute bottom-2 left-2 text-[11px] text-white/70 bg-black/40 px-1.5 py-0.5 rounded">
          {label}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Petit bip inline (data-URI, 200ms, ~440Hz)
// ---------------------------------------------------------------------------
// Généré côté client uniquement pour éviter les erreurs SSR
function playBeep() {
  if (typeof window === 'undefined') return;
  try {
    // Bip synthétique via Web Audio API (pas de fichier à héberger)
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, ctx.currentTime);
    gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.3);
  } catch {
    // Navigateur sans AudioContext : pas grave
  }
}

// ---------------------------------------------------------------------------
// Page principale
// ---------------------------------------------------------------------------
export default function KineVisioRoomPage() {
  const params = useParams();
  const seanceId = Number(params.id);

  // --- Chargement de la séance et du token Firebase ---
  const [seance, setSeance] = useState<VisioSeance | null>(null);
  const [firebaseToken, setFirebaseToken] = useState<string>('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ready, setReady] = useState(false); // true quand token + séance sont disponibles

  // --- État consent ---
  const [consentChecked, setConsentChecked] = useState(false);
  const [consentSaving, setConsentSaving] = useState(false);

  // --- Contrôles média ---
  const [micEnabled, setMicEnabled] = useState(true);
  const [camEnabled, setCamEnabled] = useState(true);

  // --- Signal sonore : jouer une seule fois par connexion ---
  const beepFiredRef = useRef(false);
  const prevStateRef = useRef<ConnState>('idle');

  // ---------------------------------------------------------------------------
  // 1. Charger séance + token Firebase en parallèle
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const auth = getAuth(app);
        const user = auth.currentUser;
        if (!user) throw new Error('Utilisateur non connecté');

        const [token, seanceData] = await Promise.all([
          user.getIdToken(),
          getSeance(seanceId),
        ]);

        if (cancelled) return;
        setFirebaseToken(token);
        setSeance(seanceData);
        setNotes(seanceData.compteRendu ?? '');
        // Si le consentement a déjà été enregistré
        if (seanceData.consentOralAt) setConsentChecked(true);
        setReady(true);
      } catch (err) {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : 'Erreur de chargement');
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [seanceId]);

  // ---------------------------------------------------------------------------
  // 2. Hook WebRTC — reste idle tant que firebaseToken est vide (hook gère le guard)
  // ---------------------------------------------------------------------------
  const { localStream, remoteStream, state, peerPresent, hostStart, endSession, retryCount, mediaError, mediaErrorReason } =
    useVisioRoom({ role: 'KINE', seanceId, token: firebaseToken || '' });

  // Modal de confirmation de fin de consultation
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);

  // Sous-modals du panneau fin de séance
  const [crOpen, setCrOpen] = useState(false);
  const [docOpen, setDocOpen] = useState(false);
  const [progOpen, setProgOpen] = useState(false);
  const { toast } = useToast();

  // Notes de séance (= brouillon du compte-rendu), autosave débounced
  const [notes, setNotes] = useState('');
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleNotesSave = useCallback((value: string) => {
    if (notesTimer.current) clearTimeout(notesTimer.current);
    notesTimer.current = setTimeout(() => {
      saveCompteRendu(seanceId, value).catch(() => {/* réessai au prochain edit */});
    }, 1500);
  }, [seanceId]);
  const flushNotes = useCallback(async () => {
    if (notesTimer.current) { clearTimeout(notesTimer.current); notesTimer.current = null; }
    try { await saveCompteRendu(seanceId, notes); } catch { /* noop */ }
  }, [seanceId, notes]);

  // Programme actif du patient (pour le panneau fin de séance : créer si aucun, sinon modifier)
  // undefined = pas encore chargé ; null = aucun programme actif ; objet = programme à modifier
  const [patientProgramme, setPatientProgramme] = useState<ProgrammeToEdit | null | undefined>(undefined);
  const loadPatientProgramme = useCallback(async () => {
    const pid = seance?.patient?.id;
    if (!pid) return;
    try {
      const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/programmes/${pid}`);
      if (!res.ok) { setPatientProgramme(null); return; }
      const data = await res.json();
      setPatientProgramme(Array.isArray(data) && data.length > 0 ? data[0] : null);
    } catch {
      setPatientProgramme(null);
    }
  }, [seance]);
  // Charger le programme du patient une fois la séance terminée (panneau affiché)
  useEffect(() => {
    if (state === 'ended') loadPatientProgramme();
  }, [state, loadPatientProgramme]);

  // ---------------------------------------------------------------------------
  // 3. Bip + animation à la connexion (une seule fois par session)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (state === 'connected' && prevStateRef.current !== 'connected' && !beepFiredRef.current) {
      beepFiredRef.current = true;
      playBeep();
    }
    prevStateRef.current = state;
  }, [state]);

  // ---------------------------------------------------------------------------
  // 4. Réinitialiser le beep quand la connexion se coupe (pour prochaine tentative)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (state === 'ended' || state === 'failed') {
      beepFiredRef.current = false;
    }
  }, [state]);

  // ---------------------------------------------------------------------------
  // 5. Toggle micro / caméra
  // ---------------------------------------------------------------------------
  const toggleMic = useCallback(() => {
    if (!localStream) return;
    const enabled = !micEnabled;
    for (const track of localStream.getAudioTracks()) {
      track.enabled = enabled;
    }
    setMicEnabled(enabled);
  }, [localStream, micEnabled]);

  const toggleCam = useCallback(() => {
    if (!localStream) return;
    const enabled = !camEnabled;
    for (const track of localStream.getVideoTracks()) {
      track.enabled = enabled;
    }
    setCamEnabled(enabled);
  }, [localStream, camEnabled]);

  // ---------------------------------------------------------------------------
  // 6. Consentement oral
  // ---------------------------------------------------------------------------
  const handleConsentChange = useCallback(
    async (checked: boolean) => {
      if (!checked || consentChecked) return; // On ne peut décocher
      setConsentChecked(true);
      setConsentSaving(true);
      try {
        await setConsent(seanceId);
      } catch {
        // En cas d'erreur réseau, on laisse coché (best-effort)
      } finally {
        setConsentSaving(false);
      }
    },
    [seanceId, consentChecked]
  );

  // ---------------------------------------------------------------------------
  // Rendu — état de chargement initial
  // ---------------------------------------------------------------------------
  if (loadError) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-4">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
          <p className="text-destructive font-medium">{loadError}</p>
          <Button variant="outline" onClick={() => window.history.back()}>
            Retour
          </Button>
        </div>
      </div>
    );
  }

  if (!ready || !seance) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground">Chargement de la séance…</p>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Infos patient + horaire
  // ---------------------------------------------------------------------------
  const patientName = seance.patient
    ? `${seance.patient.firstName} ${seance.patient.lastName}`
    : 'Patient';

  const scheduledLabel = new Date(seance.scheduledAt).toLocaleString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  // ---------------------------------------------------------------------------
  // Panneau de fin de séance : actions optionnelles enchaînables
  // ---------------------------------------------------------------------------
  if (state === 'ended') {
    return (
      <div className="mx-auto max-w-lg p-6">
        <div className="mb-6 text-center">
          <CheckCircle className="mx-auto mb-2 h-10 w-10 text-green-500" />
          <h1 className="text-xl font-semibold">Séance terminée</h1>
          <p className="text-sm text-muted-foreground">{patientName}</p>
        </div>

        <p className="mb-3 text-sm text-muted-foreground">Vous pouvez, si besoin :</p>
        <div className="space-y-3">
          <button
            onClick={() => setCrOpen(true)}
            className="flex w-full items-center gap-3 rounded-xl border p-4 text-left transition-colors hover:border-[#3899aa]/50 hover:bg-[#3899aa]/5"
          >
            <FileText className="h-5 w-5 text-[#3899aa]" />
            <div>
              <div className="font-medium">Rédiger un compte-rendu</div>
              <div className="text-xs text-muted-foreground">Note de séance, exportable en PDF</div>
            </div>
          </button>

          <button
            onClick={() => setDocOpen(true)}
            className="flex w-full items-center gap-3 rounded-xl border p-4 text-left transition-colors hover:border-[#3899aa]/50 hover:bg-[#3899aa]/5"
          >
            <Paperclip className="h-5 w-5 text-[#3899aa]" />
            <div>
              <div className="font-medium">Envoyer un document au patient</div>
              <div className="text-xs text-muted-foreground">Par email — documents non confidentiels</div>
            </div>
          </button>

          <button
            onClick={() => setProgOpen(true)}
            disabled={!seance.patient || patientProgramme === undefined}
            className="flex w-full items-center gap-3 rounded-xl border p-4 text-left transition-colors hover:border-[#3899aa]/50 hover:bg-[#3899aa]/5 disabled:opacity-50"
          >
            <Dumbbell className="h-5 w-5 text-[#3899aa]" />
            <div>
              <div className="font-medium">
                {patientProgramme ? 'Modifier le programme' : 'Créer un programme'}
              </div>
              <div className="text-xs text-muted-foreground">
                {patientProgramme === undefined
                  ? 'Chargement…'
                  : patientProgramme
                  ? 'Ajuster le programme du patient'
                  : 'Prescrire des exercices au patient'}
              </div>
            </div>
          </button>
        </div>

        <div className="mt-6 flex justify-end">
          <Button variant="outline" onClick={() => window.history.back()}>
            Fermer
          </Button>
        </div>

        <CompteRenduModal
          open={crOpen}
          onOpenChange={setCrOpen}
          seanceId={seanceId}
          initialValue={notes}
          onSaved={(text) => setNotes(text)}
        />
        <SendDocumentModal open={docOpen} onOpenChange={setDocOpen} seanceId={seanceId} />
        {seance.patient && (
          <ProgrammeModal
            open={progOpen}
            onOpenChange={setProgOpen}
            patientId={seance.patient.id}
            patientName={patientName}
            programme={patientProgramme ?? undefined}
            onCreated={() => {
              setProgOpen(false);
              toast({
                title: patientProgramme ? 'Programme mis à jour' : 'Programme créé',
                description: `Pour ${patientName}.`,
              });
              loadPatientProgramme();
            }}
          />
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Calcul du statut : message + icône
  // ---------------------------------------------------------------------------
  const isConnected = state === 'connected';
  // L'état 'ended' est géré par le panneau de fin de séance (early return plus haut) :
  // ici state ≠ 'ended', donc isEnded est toujours faux (conservé pour lisibilité des gardes).
  const isEnded = false;
  const isFailed = state === 'failed';

  const startDisabled = !consentChecked || !peerPresent || state !== 'waiting';

  // ---------------------------------------------------------------------------
  // Rendu principal
  // ---------------------------------------------------------------------------
  return (
    <div className="p-4 md:p-6 space-y-5 max-w-5xl mx-auto">

        {/* En-tête */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h1 className="text-xl font-semibold text-primary">Séance vidéo</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {patientName} — {scheduledLabel}
            </p>
          </div>

          {/* Indicateur présence patient */}
          <div className="flex items-center gap-2 text-sm font-medium">
            {peerPresent ? (
              <>
                <UserCheck className="h-4 w-4 text-green-600" />
                <span className="text-green-700">Patient prêt</span>
              </>
            ) : (
              <>
                <Clock className="h-4 w-4 text-amber-500" />
                <span className="text-amber-600">En attente du patient…</span>
              </>
            )}
          </div>
        </div>

        {/* Alerte media error */}
        {mediaError && (
          <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <p className="text-sm text-destructive">
              {mediaErrorMessage(mediaErrorReason ?? 'other')}
            </p>
          </div>
        )}

        {/* Zone vidéo */}
        <div className="relative w-full aspect-video bg-zinc-950 rounded-2xl overflow-hidden">

          {/* Flux distant (grand) */}
          <VideoTile
            stream={remoteStream}
            label={patientName}
            className="absolute inset-0 w-full h-full rounded-none"
            animate={isConnected}
            fit="contain"
          />

          {/* Flux local (PiP) */}
          <div className="absolute bottom-4 right-4 w-32 md:w-44 aspect-video z-10 shadow-lg ring-2 ring-white/20">
            <VideoTile
              stream={localStream}
              muted={true}
              label="Moi"
              className="w-full h-full"
              animate={isConnected}
            />
          </div>

          {/* Overlay d'état (affiché quand non connecté) */}
          {!isConnected && (
            <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/80 z-20">
              <div className="text-center text-white space-y-3 px-6">
                {(state === 'idle' || state === 'waiting') && !mediaError && (
                  !localStream ? (
                    <>
                      <Loader2 className="h-8 w-8 animate-spin mx-auto text-white/60" />
                      <p className="text-sm text-white/70">Initialisation de la caméra…</p>
                    </>
                  ) : peerPresent ? (
                    <>
                      <UserCheck className="h-8 w-8 mx-auto text-green-400" />
                      <p className="font-medium">Patient prêt</p>
                      <p className="text-sm text-white/60">
                        {!consentChecked
                          ? 'Coche le consentement ci-dessous, puis clique « Démarrer la vidéo ».'
                          : 'Clique « Démarrer la vidéo » pour lancer la séance.'}
                      </p>
                    </>
                  ) : (
                    <>
                      <Clock className="h-8 w-8 mx-auto text-amber-400" />
                      <p className="font-medium">En attente du patient…</p>
                      <p className="text-sm text-white/60">
                        Le patient doit ouvrir son lien et rejoindre la salle.
                      </p>
                    </>
                  )
                )}
                {state === 'connecting' && (
                  <>
                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-[#3899aa]" />
                    <p className="font-medium">Connexion en cours…</p>
                  </>
                )}
                {state === 'failed' && !mediaError && (
                  <>
                    <WifiOff className="h-8 w-8 mx-auto text-destructive" />
                    <p className="font-medium">Connexion impossible</p>
                    <p className="text-sm text-white/70 max-w-xs mx-auto">
                      Vérifie ta connexion (essaie en wifi plutôt qu'en 4G) et réessaie.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="bg-white/10 border-white/20 text-white hover:bg-white/20"
                      onClick={() => window.location.reload()}
                    >
                      <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                      Réessayer
                    </Button>
                  </>
                )}
                {/* Retry en cours */}
                {(state === 'connecting') && retryCount > 0 && (
                  <p className="text-xs text-white/50 mt-1 animate-pulse">
                    Connexion instable, nouvelle tentative… (essai {retryCount}/3)
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Barre inférieure : consentement + contrôles */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-xl border bg-card p-4">

          {/* Consentement oral */}
          <div className="flex items-start gap-3">
            <Checkbox
              id="consent"
              checked={consentChecked}
              onCheckedChange={(v) => handleConsentChange(Boolean(v))}
              disabled={consentChecked || consentSaving || isEnded}
            />
            <div>
              <Label htmlFor="consent" className="text-sm font-medium cursor-pointer leading-snug">
                Consentement oral recueilli
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Cocher après avoir informé le patient et obtenu son accord verbal.
              </p>
            </div>
            {consentSaving && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0 mt-0.5" />}
          </div>

          {/* Contrôles */}
          <div className="flex items-center gap-2 shrink-0">

            {/* Bouton Démarrer (avant connexion) */}
            {!isConnected && !isEnded && (
              <Button
                onClick={hostStart}
                disabled={startDisabled}
                className="btn-teal"
                title={
                  !consentChecked
                    ? "Coche le consentement d'abord"
                    : !peerPresent
                    ? 'En attente que le patient rejoigne'
                    : ''
                }
              >
                <Video className="h-4 w-4 mr-2" />
                Démarrer la vidéo
              </Button>
            )}

            {/* Micro */}
            <Button
              variant="outline"
              size="icon"
              onClick={toggleMic}
              disabled={!localStream || isEnded}
              title={micEnabled ? 'Couper le micro' : 'Activer le micro'}
              className={!micEnabled ? 'border-destructive text-destructive hover:bg-destructive/10' : ''}
            >
              {micEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
            </Button>

            {/* Caméra */}
            <Button
              variant="outline"
              size="icon"
              onClick={toggleCam}
              disabled={!localStream || isEnded}
              title={camEnabled ? 'Couper la caméra' : 'Activer la caméra'}
              className={!camEnabled ? 'border-destructive text-destructive hover:bg-destructive/10' : ''}
            >
              {camEnabled ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
            </Button>

            {/* Terminer la consultation (kiné uniquement, avec confirmation) */}
            {!isEnded && (
              <Button
                variant="destructive"
                onClick={() => setEndConfirmOpen(true)}
                title="Terminer la consultation"
              >
                <PhoneOff className="h-4 w-4 mr-2" />
                Terminer
              </Button>
            )}
          </div>
        </div>

        {/* Bloc notes de séance (alimente le compte-rendu) */}
        <div className="rounded-xl border bg-card p-4">
          <label htmlFor="notes-seance" className="mb-2 block text-sm font-medium">
            Notes de séance
          </label>
          <textarea
            id="notes-seance"
            className="min-h-[100px] w-full resize-y rounded-md border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-[#3899aa]/40"
            placeholder="Prends tes notes pendant la consultation…"
            value={notes}
            onChange={(e) => { setNotes(e.target.value); scheduleNotesSave(e.target.value); }}
          />
        </div>

        {/* Confirmation de fin de consultation */}
        <AlertDialog open={endConfirmOpen} onOpenChange={setEndConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Terminer la consultation ?</AlertDialogTitle>
              <AlertDialogDescription>
                La séance sera définitivement terminée, pour vous comme pour le patient.
                Le patient ne pourra plus rejoindre cette salle.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  setEndConfirmOpen(false);
                  await flushNotes();
                  endSession();
                }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Terminer la séance
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

    </div>
  );
}
