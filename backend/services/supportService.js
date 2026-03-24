// services/supportService.js
const prismaService = require('./prismaService');
const logger = require('../utils/logger');
const { sanitizeUID } = require('../utils/logSanitizer');
const { sendNotification } = require('./telegramService');
const notificationService = require('./notificationService');

/**
 * Creer un ticket support avec le premier message
 */
async function createTicket(uid, { subject, body }) {
  const prisma = prismaService.getInstance();

  const kine = await prisma.kine.findUnique({ where: { uid }, select: { id: true, email: true, firstName: true, lastName: true } });
  if (!kine) throw new Error('Kine non trouve');

  const ticket = await prisma.supportTicket.create({
    data: {
      subject,
      kineId: kine.id,
      messages: {
        create: { body, isAdmin: false }
      }
    },
    include: { messages: true }
  });

  // Notification Telegram (non-bloquante, sans PII)
  sendNotification(
    `🎫 <b>Nouveau ticket support #${ticket.id}</b>\n\n👤 Kine ID: ${kine.id}\n📋 <b>${subject}</b>\n💬 ${body.substring(0, 200)}${body.length > 200 ? '...' : ''}`
  ).catch(() => {});

  logger.info(`Ticket support #${ticket.id} cree par ${sanitizeUID(uid)}`);
  return ticket;
}

/**
 * Ajouter un message a un ticket (cote kine)
 */
async function addMessage(uid, ticketId, { body }) {
  const prisma = prismaService.getInstance();

  const kine = await prisma.kine.findUnique({ where: { uid }, select: { id: true } });
  if (!kine) throw new Error('Kine non trouve');

  const ticket = await prisma.supportTicket.findFirst({
    where: { id: ticketId, kineId: kine.id }
  });
  if (!ticket) return null;

  const message = await prisma.ticketMessage.create({
    data: { body, isAdmin: false, ticketId }
  });

  // Reouvrir le ticket si resolu
  if (ticket.status === 'RESOLVED') {
    await prisma.supportTicket.update({
      where: { id: ticketId },
      data: { status: 'OPEN', resolvedAt: null }
    });
  }

  return message;
}

/**
 * Recuperer les tickets d'un kine
 */
async function getTickets(uid) {
  const prisma = prismaService.getInstance();

  const kine = await prisma.kine.findUnique({ where: { uid }, select: { id: true } });
  if (!kine) throw new Error('Kine non trouve');

  return prisma.supportTicket.findMany({
    where: { kineId: kine.id },
    include: {
      messages: { orderBy: { createdAt: 'asc' } }
    },
    orderBy: { updatedAt: 'desc' },
    take: 50
  });
}

/**
 * Recuperer un ticket par ID (cote kine, avec verification ownership)
 */
async function getTicketById(uid, ticketId) {
  const prisma = prismaService.getInstance();

  const kine = await prisma.kine.findUnique({ where: { uid }, select: { id: true } });
  if (!kine) throw new Error('Kine non trouve');

  return prisma.supportTicket.findFirst({
    where: { id: ticketId, kineId: kine.id },
    include: {
      messages: { orderBy: { createdAt: 'asc' } }
    }
  });
}

/**
 * Cloturer un ticket (cote kine)
 */
async function closeTicket(uid, ticketId) {
  const prisma = prismaService.getInstance();

  const kine = await prisma.kine.findUnique({ where: { uid }, select: { id: true } });
  if (!kine) throw new Error('Kine non trouve');

  const ticket = await prisma.supportTicket.findFirst({
    where: { id: ticketId, kineId: kine.id }
  });
  if (!ticket) return null;

  return prisma.supportTicket.update({
    where: { id: ticketId },
    data: { status: 'RESOLVED', resolvedAt: new Date() }
  });
}

// ========== ADMIN ==========

/**
 * Recuperer tous les tickets OPEN (admin)
 */
async function getOpenTickets() {
  const prisma = prismaService.getInstance();

  return prisma.supportTicket.findMany({
    where: { status: 'OPEN' },
    include: {
      kine: { select: { id: true, firstName: true, lastName: true, email: true, planType: true } },
      messages: { orderBy: { createdAt: 'asc' } }
    },
    orderBy: { updatedAt: 'asc' },
    take: 50
  });
}

/**
 * Repondre a un ticket (admin)
 */
async function adminReply(ticketId, { body }) {
  const prisma = prismaService.getInstance();

  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    select: { id: true, subject: true, kineId: true }
  });
  if (!ticket) return null;

  const message = await prisma.ticketMessage.create({
    data: { body, isAdmin: true, ticketId }
  });

  // Mise a jour du updatedAt
  await prisma.supportTicket.update({
    where: { id: ticketId },
    data: { updatedAt: new Date() }
  });

  // Notification in-app pour le kine
  await notificationService.createNotification({
    type: 'SUPPORT_REPLY',
    title: 'Reponse du support',
    message: `Nouvelle reponse sur votre ticket "${ticket.subject}"`,
    kineId: ticket.kineId,
    metadata: { ticketId: ticket.id }
  });

  logger.info(`Reponse admin sur ticket #${ticketId}`);
  return message;
}

/**
 * Marquer un ticket comme resolu (admin)
 */
async function resolveTicket(ticketId) {
  const prisma = prismaService.getInstance();

  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    select: { id: true, subject: true, kineId: true }
  });
  if (!ticket) return null;

  const updated = await prisma.supportTicket.update({
    where: { id: ticketId },
    data: { status: 'RESOLVED', resolvedAt: new Date() }
  });

  // Notification in-app
  await notificationService.createNotification({
    type: 'SUPPORT_REPLY',
    title: 'Ticket resolu',
    message: `Votre ticket "${ticket.subject}" a ete marque comme resolu.`,
    kineId: ticket.kineId,
    metadata: { ticketId: ticket.id }
  });

  logger.info(`Ticket #${ticketId} resolu`);
  return updated;
}

module.exports = {
  createTicket,
  addMessage,
  getTickets,
  getTicketById,
  closeTicket,
  getOpenTickets,
  adminReply,
  resolveTicket
};
