const admin = require('../firebase/firebase');
const prismaService = require('../services/prismaService');
const logger = require('../utils/logger');
const { sanitizeIP } = require('../utils/logSanitizer');
const { validateVisioToken } = require('./visioTokenService');

const CLOSED_STATUSES = ['CANCELLED', 'ENDED'];

// ── Garde-fou anti-flood sur le handshake du namespace /visio ──
// express-rate-limit ne couvre pas le canal Socket.IO (le handshake court-circuite
// la pile de routes Express). On compte donc à la main les handshakes par IP sur une
// fenêtre courte. Défense en profondeur contre les floods naïfs ; per-instance (non
// partagé entre instances Clever Cloud) et l'IP dépend de X-Forwarded-For (cf. MED-06).
const HANDSHAKE_WINDOW_MS = 60 * 1000; // 1 minute
const HANDSHAKE_MAX = 20; // 20 handshakes/min/IP — large : la reconnexion auto du client rouvre le socket
const handshakeHits = new Map(); // ip -> { count, resetAt }

function handshakeIp(handshake) {
  // Derrière le proxy Clever Cloud, la vraie IP est le 1er élément de X-Forwarded-For.
  // socket.handshake.address donnerait l'IP du load-balancer (= une seule pour tous).
  const xff = handshake.headers && handshake.headers['x-forwarded-for'];
  if (xff) return xff.split(',')[0].trim();
  return handshake.address || 'unknown';
}

function allowHandshake(handshake) {
  const ip = handshakeIp(handshake);
  const now = Date.now();
  const entry = handshakeHits.get(ip);
  if (!entry || now > entry.resetAt) {
    handshakeHits.set(ip, { count: 1, resetAt: now + HANDSHAKE_WINDOW_MS });
    return true;
  }
  entry.count += 1;
  return entry.count <= HANDSHAKE_MAX;
}

// Balayage périodique des entrées expirées (évite la croissance mémoire).
// .unref() : ne maintient pas le process en vie à l'arrêt.
const handshakeSweep = setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of handshakeHits) {
    if (now > entry.resetAt) handshakeHits.delete(ip);
  }
}, 5 * 60 * 1000);
handshakeSweep.unref();

function authError(message, code) {
  const err = new Error(message);
  err.data = { code };
  return err;
}

/**
 * Authentifie une connexion socket depuis handshake.auth = { role, token, seanceId }.
 * KINE → token Firebase + ownership. PATIENT → token de séance.
 */
async function authenticateSocket(handshake) {
  const auth = handshake.auth || {};
  const { role, token, seanceId } = auth;
  if (!token || !seanceId || !['KINE', 'PATIENT'].includes(role)) {
    throw authError('Handshake invalide', 'BAD_HANDSHAKE');
  }
  const prisma = prismaService.getInstance();
  const seance = await prisma.visioSeance.findUnique({ where: { id: parseInt(seanceId) } });
  if (!seance || !seance.isActive || CLOSED_STATUSES.includes(seance.status)) {
    throw authError('Seance indisponible', 'SEANCE_INVALID');
  }

  if (role === 'KINE') {
    const decoded = await admin.auth().verifyIdToken(token);
    const kine = await prisma.kine.findUnique({ where: { uid: decoded.uid } });
    if (!kine || kine.id !== seance.kineId) {
      throw authError('Acces refuse', 'NOT_OWNER');
    }
    return { role: 'KINE', seance };
  }

  // PATIENT
  const validation = validateVisioToken(token);
  if (!validation.success || validation.seanceId !== seance.id || validation.patientId !== seance.patientId) {
    throw authError('Token patient invalide', 'BAD_PATIENT_TOKEN');
  }
  return { role: 'PATIENT', seance };
}

function canHostStart(seance) {
  return !!seance.consentOralAt;
}

/**
 * Attache le namespace /visio : auth au handshake, room = roomId, relais du signaling.
 */
// Référence au namespace /visio, pour interroger la présence en dehors des handlers.
let visioNamespace = null;

/**
 * Indique si un patient est actuellement connecté à la room d'une séance.
 * Single-instance : lit les sockets locaux du namespace.
 */
function isPatientPresent(roomId) {
  if (!visioNamespace || !roomId) return false;
  const room = visioNamespace.adapter.rooms.get(roomId);
  if (!room) return false;
  for (const id of room) {
    const s = visioNamespace.sockets.get(id);
    if (s && s.data.role === 'PATIENT') return true;
  }
  return false;
}

function registerVisioNamespace(io) {
  const ns = io.of('/visio');
  visioNamespace = ns;

  // Garde-fou anti-flood AVANT l'auth : rejette le handshake avant tout appel DB/Firebase.
  ns.use((socket, next) => {
    if (!allowHandshake(socket.handshake)) {
      logger.warn(`🚫 Visio handshake rate limit - IP: ${sanitizeIP(handshakeIp(socket.handshake))}`);
      return next(authError('Trop de tentatives de connexion', 'RATE_LIMITED'));
    }
    next();
  });

  ns.use(async (socket, next) => {
    try {
      const { role, seance } = await authenticateSocket(socket.handshake);
      socket.data.role = role;
      socket.data.seance = seance;
      socket.data.roomId = seance.roomId;
      next();
    } catch (err) {
      next(err);
    }
  });

  ns.on('connection', (socket) => {
    const { roomId, role } = socket.data;
    const room = ns.adapter.rooms.get(roomId);
    // IDs déjà présents AVANT que ce socket rejoigne
    const existingIds = room ? [...room] : [];
    if (existingIds.length >= 2) {
      socket.emit('room-full');
      return socket.disconnect(true);
    }
    socket.join(roomId);
    // Prévenir les pairs déjà présents de l'arrivée de ce socket
    socket.to(roomId).emit('peer-ready', { role });
    // Prévenir ce socket des pairs déjà présents — sinon celui qui rejoint en
    // second (typiquement le kiné) ne découvre jamais l'autre (reste "en attente").
    for (const id of existingIds) {
      const other = ns.sockets.get(id);
      if (other) socket.emit('peer-ready', { role: other.data.role });
    }

    // Le kiné annonce qu'il est prêt / présent
    socket.on('peer-ready', () => socket.to(roomId).emit('peer-ready', { role }));

    // Le kiné lance la vidéo — exige le consentement tracé
    socket.on('host-start', async () => {
      if (role !== 'KINE') return;
      const prisma = prismaService.getInstance();
      const fresh = await prisma.visioSeance.findUnique({ where: { id: socket.data.seance.id } });
      if (!fresh || !canHostStart(fresh)) {
        return socket.emit('host-start-refused', { code: 'CONSENT_REQUIRED' });
      }
      try {
        await prisma.visioSeance.update({
          where: { id: fresh.id },
          data: { status: 'LIVE', startedAt: fresh.startedAt || new Date() },
        });
        socket.to(roomId).emit('host-start');
      } catch (e) {
        logger.error('host-start update:', e.message);
      }
    });

    // Relais WebRTC
    socket.on('offer', (payload) => socket.to(roomId).emit('offer', payload));
    socket.on('answer', (payload) => socket.to(roomId).emit('answer', payload));
    socket.on('ice-candidate', (payload) => socket.to(roomId).emit('ice-candidate', payload));

    // Seul le KINE peut terminer la consultation (séance → ENDED, terminal).
    // Le patient qui « quitte » se contente de se déconnecter (disconnect → peer-left) :
    // la séance reste ouverte et il peut re-rejoindre tant qu'elle n'est pas terminée.
    socket.on('end-session', async () => {
      if (role !== 'KINE') return;
      const prisma = prismaService.getInstance();
      await prisma.visioSeance.update({
        where: { id: socket.data.seance.id },
        data: { status: 'ENDED', endedAt: new Date() },
      }).catch((e) => logger.error('end-session update:', e.message));
      // Notifie toute la room (kiné inclus) → état terminé des deux côtés.
      ns.to(roomId).emit('session-ended');
    });

    socket.on('disconnect', () => {
      socket.to(roomId).emit('peer-left', { role });
    });
  });

  return ns;
}

module.exports = { authenticateSocket, canHostStart, registerVisioNamespace, isPatientPresent };
