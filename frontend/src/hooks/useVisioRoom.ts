'use client';

/**
 * Hook WebRTC partagé pour la visio télésoin kiné↔patient.
 * - Rôle offrant : KINE (hostStart déclenche createOffer)
 * - Rôle répondant : PATIENT (répond à l'offer via createAnswer)
 * - Socket.IO namespace /visio sur NEXT_PUBLIC_API_URL
 * - Retry auto jusqu'à 3 fois sur iceConnectionState failed uniquement ('disconnected' est transitoire)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

export type VisioRole = 'KINE' | 'PATIENT';
export type ConnState = 'idle' | 'waiting' | 'connecting' | 'connected' | 'failed' | 'ended';

export interface UseVisioRoom {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  state: ConnState;
  peerPresent: boolean;
  hostStart: () => void; // KINE uniquement
  hangup: () => void;
  retryCount: number;
  mediaError: boolean; // true si getUserMedia refusé/échoué
}

const MAX_RETRIES = 3;

const STUN_URLS = (
  process.env.NEXT_PUBLIC_VISIO_STUN || 'stun:stun.l.google.com:19302'
).split(',');

const ICE_SERVERS: RTCIceServer[] = [{ urls: STUN_URLS }];

export function useVisioRoom(opts: {
  role: VisioRole;
  seanceId: number;
  token: string;
}): UseVisioRoom {
  const { role, seanceId, token } = opts;

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [state, setState] = useState<ConnState>('idle');
  const [peerPresent, setPeerPresent] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [mediaError, setMediaError] = useState(false);

  // Refs stables entre renders — évitent les captures de closures périmées
  const socketRef = useRef<Socket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteDescSet = useRef(false); // remoteDescription posée ?
  const iceCandidateQueue = useRef<RTCIceCandidateInit[]>([]); // buffer avant remoteDesc
  const retryCountRef = useRef(0);
  const mountedRef = useRef(true); // garde contre setState après unmount

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  /** Pose une remoteDescription et vide le buffer ICE */
  const applyRemoteDescription = useCallback(
    async (pc: RTCPeerConnection, sdp: RTCSessionDescriptionInit) => {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      remoteDescSet.current = true;
      // Vider le buffer
      for (const c of iceCandidateQueue.current) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(c));
        } catch {
          // candidat obsolète : ignorer
        }
      }
      iceCandidateQueue.current = [];
    },
    []
  );

  /** Crée un nouveau RTCPeerConnection propre, ferme l'ancien si présent */
  const createPc = useCallback((): RTCPeerConnection => {
    // Fermer l'ancienne connexion si elle existe
    if (pcRef.current) {
      pcRef.current.onicecandidate = null;
      pcRef.current.ontrack = null;
      pcRef.current.oniceconnectionstatechange = null;
      pcRef.current.close();
    }
    remoteDescSet.current = false;
    iceCandidateQueue.current = [];

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = pc;

    // Ajouter les tracks locaux
    if (localStreamRef.current) {
      for (const track of localStreamRef.current.getTracks()) {
        pc.addTrack(track, localStreamRef.current);
      }
    }

    // ICE candidate → émettre vers le peer
    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        socketRef.current.emit('ice-candidate', { candidate: event.candidate });
      }
    };

    // Remote track reçu → construire remoteStream
    pc.ontrack = (event) => {
      if (!mountedRef.current) return;
      const stream = event.streams[0] ?? new MediaStream([event.track]);
      setRemoteStream(stream);
    };

    // Changements d'état ICE → connected / retry / failed
    pc.oniceconnectionstatechange = () => {
      if (!mountedRef.current) return;
      const iceState = pc.iceConnectionState;

      if (iceState === 'connected' || iceState === 'completed') {
        setState('connected');
      } else if (iceState === 'failed') {
        handleIceFailure();
      }
      // 'disconnected' est souvent transitoire : WebRTC peut se reconnecter seul.
      // On ne consomme pas un retry — on attend sans rien faire.
    };

    return pc;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // (applyRemoteDescription, handleIceFailure définis ci-dessous — référencés par ref)

  // Référence stable vers handleIceFailure pour éviter les cycles de dépendances
  const handleIceFailureRef = useRef<() => void>(() => {});

  const handleIceFailure = useCallback(() => {
    handleIceFailureRef.current();
  }, []);

  // --------------------------------------------------------------------------
  // Effect principal : media + socket
  // --------------------------------------------------------------------------
  useEffect(() => {
    // Ne pas initialiser tant que le token n'est pas disponible
    if (!token) return;

    mountedRef.current = true;
    // Drapeau propre à CETTE exécution de l'effet. React 18 StrictMode monte l'effet
    // 2× en dev ; comme getUserMedia est async, sans ce drapeau le socket du 1er montage
    // est créé après son cleanup (socketRef encore vide → non fermé) → socket orphelin
    // qui remplit la room. mountedRef ne suffit pas (remis à true par le 2e montage).
    let cancelled = false;

    // 1. Acquérir le média local
    let mediaStream: MediaStream | null = null;

    const init = async () => {
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        if (cancelled) {
          // Effet nettoyé pendant l'acquisition média → ne pas créer de socket orphelin
          for (const t of mediaStream.getTracks()) t.stop();
          return;
        }
        localStreamRef.current = mediaStream;
        setLocalStream(mediaStream);
        setMediaError(false);
      } catch (err) {
        // Log l'erreur réelle pour diagnostic (NotAllowedError / NotFoundError /
        // NotReadableError / OverconstrainedError / TypeError si mediaDevices absent…)
        // eslint-disable-next-line no-console
        console.error(
          '[visio] getUserMedia a échoué:',
          (err as Error)?.name,
          '-',
          (err as Error)?.message
        );
        if (!mountedRef.current) return;
        setMediaError(true);
        setState('failed');
        return; // Pas de socket si pas de média
      }

      // 2. Connexion Socket.IO
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? '';
      const socket = io(`${apiUrl}/visio`, {
        auth: { role, token, seanceId },
        transports: ['websocket'],
        reconnection: true,
      });
      socketRef.current = socket;

      // Annoncer la présence à chaque (re)connexion
      socket.on('connect', () => {
        socket.emit('peer-ready');
      });

      // Erreur de connexion au signaling (CSP ws://, réseau, ou handshake refusé)
      socket.on('connect_error', (e: Error) => {
        // eslint-disable-next-line no-console
        console.error('[visio] Erreur de connexion au signaling:', e.message);
      });

      // ---- Événements serveur → client ----

      // Un peer est présent dans la salle
      socket.on('peer-ready', () => {
        if (!mountedRef.current) return;
        setPeerPresent(true);
        // Si on était en idle et que le peer arrive → waiting
        setState((prev) => (prev === 'idle' ? 'waiting' : prev));
      });

      // room-full : impossible de rejoindre
      socket.on('room-full', () => {
        if (!mountedRef.current) return;
        setState('failed');
      });

      // host-start : reçu par le PATIENT uniquement (le serveur ne le renvoie pas au KINE)
      socket.on('host-start', () => {
        if (!mountedRef.current || role !== 'PATIENT') return;
        setState('connecting');
      });

      // Le kiné refuse rarissime (host-start-refused)
      socket.on('host-start-refused', ({ code }: { code: string }) => {
        if (!mountedRef.current) return;
        // Remonter silencieusement ; la page peut surveiller state
        console.warn('[useVisioRoom] host-start-refused', code);
        setState('failed');
      });

      // Offer reçue (PATIENT)
      socket.on('offer', async ({ sdp }: { sdp: RTCSessionDescriptionInit }) => {
        if (!mountedRef.current || role !== 'PATIENT') return;

        const pc = createPc();
        await applyRemoteDescription(pc, sdp);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('answer', { sdp: answer });
      });

      // Answer reçue (KINE)
      socket.on('answer', async ({ sdp }: { sdp: RTCSessionDescriptionInit }) => {
        if (!mountedRef.current || role !== 'KINE') return;
        const pc = pcRef.current;
        if (!pc) return;
        await applyRemoteDescription(pc, sdp);
      });

      // ICE candidate reçu des deux côtés
      socket.on('ice-candidate', async ({ candidate }: { candidate: RTCIceCandidateInit }) => {
        if (!mountedRef.current) return;
        const pc = pcRef.current;
        if (!pc) return;

        if (remoteDescSet.current) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch {
            // candidat obsolète ou invalide : ignorer
          }
        } else {
          // Bufferiser jusqu'à ce que remoteDescription soit posée
          iceCandidateQueue.current.push(candidate);
        }
      });

      // hangup reçu de l'autre côté
      socket.on('hangup', () => {
        if (!mountedRef.current) return;
        cleanupCall();
        setState('ended');
      });

      // Peer parti
      socket.on('peer-left', () => {
        if (!mountedRef.current) return;
        setPeerPresent(false);
      });

      // ---- Logique de retry (closure capturant socket + createPc) ----
      handleIceFailureRef.current = async () => {
        if (!mountedRef.current) return;
        const currentRetry = retryCountRef.current;

        if (currentRetry >= MAX_RETRIES) {
          setState('failed');
          return;
        }

        retryCountRef.current = currentRetry + 1;
        setRetryCount(retryCountRef.current);

        if (role === 'KINE') {
          // Le KINE re-négocie avec iceRestart
          const pc = createPc();
          setState('connecting');
          const offer = await pc.createOffer({ iceRestart: true });
          await pc.setLocalDescription(offer);
          socket.emit('offer', { sdp: offer });
        }
        // Le PATIENT attend la nouvelle offer du KINE
      };
    };

    init();

    // Cleanup au démontage
    return () => {
      cancelled = true;
      mountedRef.current = false;
      cleanupAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, seanceId, token]); // Re-mount si les paramètres changent (cas edge)

  // --------------------------------------------------------------------------
  // Helpers de nettoyage (stables, utilisent des refs)
  // --------------------------------------------------------------------------

  /** Ferme le RTCPeerConnection sans toucher au socket ni aux tracks locaux */
  const cleanupCall = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.onicecandidate = null;
      pcRef.current.ontrack = null;
      pcRef.current.oniceconnectionstatechange = null;
      pcRef.current.close();
      pcRef.current = null;
    }
    remoteDescSet.current = false;
    iceCandidateQueue.current = [];
    setRemoteStream(null);
  }, []);

  /** Nettoyage complet : PC + tracks locaux + socket */
  const cleanupAll = useCallback(() => {
    cleanupCall();
    if (localStreamRef.current) {
      for (const t of localStreamRef.current.getTracks()) t.stop();
      localStreamRef.current = null;
    }
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
  }, [cleanupCall]);

  // --------------------------------------------------------------------------
  // API publique
  // --------------------------------------------------------------------------

  /** KINE : démarre la session (hostStart + createOffer) */
  const hostStart = useCallback(async () => {
    if (role !== 'KINE') return;
    const socket = socketRef.current;
    if (!socket) return;

    socket.emit('host-start');

    const pc = createPc();
    setState('connecting');

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('offer', { sdp: offer });
  }, [role, createPc]);

  /** Les deux rôles : raccrocher */
  const hangup = useCallback(() => {
    const socket = socketRef.current;
    if (socket) {
      socket.emit('hangup');
    }
    cleanupCall();
    if (localStreamRef.current) {
      for (const t of localStreamRef.current.getTracks()) t.stop();
      localStreamRef.current = null;
    }
    if (mountedRef.current) {
      setState('ended');
      setLocalStream(null);
    }
    // Déconnecter le socket pour éviter les reconnexions automatiques
    // après raccroché (reconnection: true reste actif sinon).
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
  }, [cleanupCall]);

  return {
    localStream,
    remoteStream,
    state,
    peerPresent,
    hostStart,
    hangup,
    retryCount,
    mediaError,
  };
}
