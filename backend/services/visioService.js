const crypto = require('crypto');
const prismaService = require('../services/prismaService');
const logger = require('../utils/logger');
const { generateVisioToken } = require('./visioTokenService');
const { sendSeanceLink } = require('./visioLinkService');
const { isMobileFR } = require('./phoneUtils');

class VisioError extends Error {
  constructor(message, code, httpStatus = 400) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3001';
const RESEND_COOLDOWN_MS = 2 * 60 * 1000; // 2 min entre 2 renvois de lien pour une même séance

async function createSeance(kineId, { patientId, scheduledAt, deliveryChannel, prereqsAttested }) {
  if (prereqsAttested !== true) {
    throw new VisioError('Pre-requis telesoin non attestes', 'PREREQS_NOT_ATTESTED', 400);
  }
  if (!['EMAIL', 'WHATSAPP'].includes(deliveryChannel)) {
    throw new VisioError('Canal de transmission invalide', 'INVALID_CHANNEL', 400);
  }
  const when = new Date(scheduledAt);
  if (Number.isNaN(when.getTime()) || when.getTime() < Date.now()) {
    throw new VisioError('Date de seance invalide', 'INVALID_SCHEDULE', 400);
  }

  const prisma = prismaService.getInstance();
  const patient = await prisma.patient.findFirst({
    where: { id: parseInt(patientId), kineId, isActive: true },
  });
  if (!patient) {
    throw new VisioError('Patient introuvable', 'PATIENT_NOT_FOUND', 404);
  }
  if (deliveryChannel === 'EMAIL' && !patient.email) {
    throw new VisioError('Le patient n\'a pas d\'email', 'NO_EMAIL', 400);
  }
  if (deliveryChannel === 'WHATSAPP' && !isMobileFR(patient.phone)) {
    throw new VisioError('Le numero n\'est pas un mobile', 'NOT_MOBILE', 400);
  }

  const roomId = crypto.randomUUID();
  const now = new Date();
  const seance = await prisma.visioSeance.create({
    data: {
      roomId,
      scheduledAt: when,
      status: 'SCHEDULED',
      deliveryChannel,
      prereqsAttested: true,
      prereqsValidatedAt: now,
      kineId,
      patientId: patient.id,
    },
  });

  const gen = generateVisioToken(seance.id, patient.id, when);
  if (!gen.success) {
    throw new VisioError('Erreur generation du lien', 'TOKEN_ERROR', 500);
  }
  const seanceUrl = `${FRONTEND_URL}/visio/${gen.token}`;

  const sent = await sendSeanceLink({
    channel: deliveryChannel, patient, token: gen.token, seanceUrl, scheduledAt: when,
  });
  const updated = await prisma.visioSeance.update({
    where: { id: seance.id },
    data: { linkSentAt: sent.success ? now : null },
  });

  return { seance: updated, seanceUrl, linkSent: sent.success };
}

async function listSeances(kineId, { archived = false } = {}) {
  const prisma = prismaService.getInstance();
  return prisma.visioSeance.findMany({
    where: { kineId, isActive: true, isArchived: archived },
    orderBy: { scheduledAt: 'desc' },
    include: { patient: { select: { id: true, firstName: true, lastName: true } } },
  });
}

async function getSeanceForKine(kineId, seanceId) {
  const prisma = prismaService.getInstance();
  return prisma.visioSeance.findFirst({
    where: { id: parseInt(seanceId), kineId, isActive: true },
    include: { patient: { select: { id: true, firstName: true, lastName: true } } },
  });
}

async function requireOwnedSeance(kineId, seanceId) {
  const prisma = prismaService.getInstance();
  const seance = await prisma.visioSeance.findFirst({
    where: { id: parseInt(seanceId), kineId, isActive: true },
  });
  if (!seance) throw new VisioError('Seance introuvable', 'SEANCE_NOT_FOUND', 404);
  return seance;
}

async function setConsent(kineId, seanceId) {
  await requireOwnedSeance(kineId, seanceId);
  const prisma = prismaService.getInstance();
  return prisma.visioSeance.update({
    where: { id: parseInt(seanceId) },
    data: { consentOralAt: new Date() },
  });
}

async function cancelSeance(kineId, seanceId) {
  await requireOwnedSeance(kineId, seanceId);
  const prisma = prismaService.getInstance();
  return prisma.visioSeance.update({
    where: { id: parseInt(seanceId) },
    data: { status: 'CANCELLED' },
  });
}

/**
 * Archive en lot des séances d'historique du kiné.
 * Sécurité : n'archive que les séances possédées, encore actives, non déjà archivées,
 * et appartenant à l'historique (terminées/annulées, ou programmées dont le jour est passé).
 * Un RDV à venir ne peut donc pas être archivé, même via requête forgée.
 */
async function archiveSeances(kineId, ids) {
  const numericIds = (Array.isArray(ids) ? ids : [])
    .map((x) => parseInt(x, 10))
    .filter((n) => Number.isInteger(n));
  if (numericIds.length === 0) {
    throw new VisioError('Aucune seance a archiver', 'NO_IDS', 400);
  }
  const prisma = prismaService.getInstance();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const result = await prisma.visioSeance.updateMany({
    where: {
      id: { in: numericIds },
      kineId,
      isActive: true,
      isArchived: false,
      OR: [
        { status: { in: ['ENDED', 'CANCELLED'] } },
        { status: 'SCHEDULED', scheduledAt: { lt: startOfToday } },
      ],
    },
    data: { isArchived: true, archivedAt: new Date() },
  });
  return { archived: result.count };
}

/** Désarchive une séance (retour dans l'historique récent). */
async function unarchiveSeance(kineId, seanceId) {
  await requireOwnedSeance(kineId, seanceId);
  const prisma = prismaService.getInstance();
  return prisma.visioSeance.update({
    where: { id: parseInt(seanceId) },
    data: { isArchived: false, archivedAt: null },
  });
}

/** Enregistre le texte du compte-rendu (DB HDS uniquement). */
async function setCompteRendu(kineId, seanceId, compteRendu) {
  await requireOwnedSeance(kineId, seanceId);
  const prisma = prismaService.getInstance();
  return prisma.visioSeance.update({
    where: { id: parseInt(seanceId) },
    data: { compteRendu: compteRendu ?? '', compteRenduAt: new Date() },
  });
}

/** Récupère une séance du kiné avec patient + kine (pour générer le PDF / envoyer un doc). */
async function getSeanceFull(kineId, seanceId) {
  const prisma = prismaService.getInstance();
  const seance = await prisma.visioSeance.findFirst({
    where: { id: parseInt(seanceId), kineId, isActive: true },
    include: {
      patient: { select: { id: true, firstName: true, lastName: true, email: true } },
      kine: { select: { id: true, firstName: true, lastName: true, rpps: true, adresseCabinet: true } },
    },
  });
  if (!seance) throw new VisioError('Seance introuvable', 'SEANCE_NOT_FOUND', 404);
  return seance;
}

/**
 * Reprogramme une séance SCHEDULED : nouvel horaire, régénère le token patient
 * et renvoie le lien via le canal d'origine.
 */
async function rescheduleSeance(kineId, seanceId, scheduledAt) {
  const when = new Date(scheduledAt);
  if (Number.isNaN(when.getTime()) || when.getTime() < Date.now()) {
    throw new VisioError('Date de seance invalide', 'INVALID_SCHEDULE', 400);
  }

  const prisma = prismaService.getInstance();
  const seance = await prisma.visioSeance.findFirst({
    where: { id: parseInt(seanceId), kineId, isActive: true },
  });
  if (!seance) throw new VisioError('Seance introuvable', 'SEANCE_NOT_FOUND', 404);
  if (seance.status !== 'SCHEDULED') {
    throw new VisioError('Seance non reprogrammable', 'NOT_RESCHEDULABLE', 409);
  }

  const patient = await prisma.patient.findFirst({
    where: { id: seance.patientId, kineId, isActive: true },
  });
  if (!patient) throw new VisioError('Patient introuvable', 'PATIENT_NOT_FOUND', 404);

  const gen = generateVisioToken(seance.id, patient.id, when);
  if (!gen.success) throw new VisioError('Erreur generation du lien', 'TOKEN_ERROR', 500);
  const seanceUrl = `${FRONTEND_URL}/visio/${gen.token}`;

  const sent = await sendSeanceLink({
    channel: seance.deliveryChannel, patient, token: gen.token, seanceUrl, scheduledAt: when,
  });

  return prisma.visioSeance.update({
    where: { id: seance.id },
    data: { scheduledAt: when, linkSentAt: sent.success ? new Date() : null },
  });
}

/**
 * Renvoie le lien d'une séance (SCHEDULED ou LIVE) via le canal choisi
 * (éventuellement différent de l'original). Régénère un token pour l'horaire courant.
 * Met à jour le canal de la séance sur celui choisi.
 */
async function resendLink(kineId, seanceId, deliveryChannel) {
  if (!['EMAIL', 'WHATSAPP'].includes(deliveryChannel)) {
    throw new VisioError('Canal de transmission invalide', 'INVALID_CHANNEL', 400);
  }

  const prisma = prismaService.getInstance();
  const seance = await prisma.visioSeance.findFirst({
    where: { id: parseInt(seanceId), kineId, isActive: true },
  });
  if (!seance) throw new VisioError('Seance introuvable', 'SEANCE_NOT_FOUND', 404);
  if (!['SCHEDULED', 'LIVE'].includes(seance.status)) {
    throw new VisioError('Lien non renvoyable', 'NOT_RESENDABLE', 409);
  }

  // Cooldown anti-spam par séance/patient : pas de renvoi si le dernier envoi
  // date de moins de RESEND_COOLDOWN_MS (le plafond horaire par kiné vit côté route).
  if (seance.linkSentAt && Date.now() - new Date(seance.linkSentAt).getTime() < RESEND_COOLDOWN_MS) {
    throw new VisioError('Lien déjà envoyé récemment, patiente quelques minutes', 'RESEND_COOLDOWN', 429);
  }

  const patient = await prisma.patient.findFirst({
    where: { id: seance.patientId, kineId, isActive: true },
  });
  if (!patient) throw new VisioError('Patient introuvable', 'PATIENT_NOT_FOUND', 404);
  if (deliveryChannel === 'EMAIL' && !patient.email) {
    throw new VisioError('Le patient n\'a pas d\'email', 'NO_EMAIL', 400);
  }
  if (deliveryChannel === 'WHATSAPP' && !isMobileFR(patient.phone)) {
    throw new VisioError('Le numero n\'est pas un mobile', 'NOT_MOBILE', 400);
  }

  const gen = generateVisioToken(seance.id, patient.id, seance.scheduledAt);
  if (!gen.success) throw new VisioError('Erreur generation du lien', 'TOKEN_ERROR', 500);
  const seanceUrl = `${FRONTEND_URL}/visio/${gen.token}`;

  const sent = await sendSeanceLink({
    channel: deliveryChannel, patient, token: gen.token, seanceUrl, scheduledAt: seance.scheduledAt,
  });
  if (!sent.success) throw new VisioError('Echec de l\'envoi du lien', 'SEND_FAILED', 502);

  return prisma.visioSeance.update({
    where: { id: seance.id },
    data: { deliveryChannel, linkSentAt: new Date() },
  });
}

module.exports = {
  VisioError,
  createSeance,
  listSeances,
  getSeanceForKine,
  setConsent,
  cancelSeance,
  resendLink,
  rescheduleSeance,
  archiveSeances,
  unarchiveSeance,
  setCompteRendu,
  getSeanceFull,
};
