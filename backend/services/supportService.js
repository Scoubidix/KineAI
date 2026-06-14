// services/supportService.js
const prismaService = require('./prismaService');
const logger = require('../utils/logger');
const { sanitizeUID } = require('../utils/logSanitizer');
const { sendNotification } = require('./telegramService');
const notificationService = require('./notificationService');
const gcsStorageService = require('./gcsStorageService');

/**
 * Enrichit les messages d'un ou plusieurs tickets avec une URL signee temporaire
 * pour leur piece jointe (imagePath -> imageUrl). Mutation en place.
 */
async function attachImageUrls(ticketOrTickets) {
  const tickets = Array.isArray(ticketOrTickets) ? ticketOrTickets : [ticketOrTickets];
  for (const ticket of tickets) {
    if (!ticket?.messages) continue;
    for (const msg of ticket.messages) {
      msg.imageUrl = msg.imagePath
        ? await gcsStorageService.generateSignedUrl(msg.imagePath)
        : null;
    }
  }
  return ticketOrTickets;
}

/**
 * Supprime de GCS toutes les pieces jointes d'un ticket et nettoie les imagePath en DB.
 * Appele a la resolution/cloture d'un ticket.
 */
async function purgeTicketImages(prisma, ticketId) {
  const messages = await prisma.ticketMessage.findMany({
    where: { ticketId, imagePath: { not: null } },
    select: { id: true, imagePath: true }
  });

  for (const msg of messages) {
    try {
      await gcsStorageService.deleteSupportImage(msg.imagePath);
    } catch (err) {
      logger.warn(`Impossible de supprimer l'image support du message #${msg.id}: ${err.message}`);
    }
  }

  if (messages.length > 0) {
    await prisma.ticketMessage.updateMany({
      where: { ticketId, imagePath: { not: null } },
      data: { imagePath: null }
    });
    logger.info(`${messages.length} image(s) support purgee(s) pour le ticket #${ticketId}`);
  }
}

/**
 * Creer un ticket support avec le premier message
 */
async function createTicket(uid, { subject, body, imagePath = null }) {
  const prisma = prismaService.getInstance();

  const kine = await prisma.kine.findUnique({ where: { uid }, select: { id: true, email: true, firstName: true, lastName: true } });
  if (!kine) throw new Error('Kine non trouve');

  const ticket = await prisma.supportTicket.create({
    data: {
      subject,
      kineId: kine.id,
      messages: {
        create: { body, isAdmin: false, imagePath }
      }
    },
    include: { messages: true }
  });

  // Notification Telegram (non-bloquante, sans PII)
  sendNotification(
    `🎫 <b>Nouveau ticket support #${ticket.id}</b>\n\n👤 Kine ID: ${kine.id}\n📋 <b>${subject}</b>\n💬 ${body.substring(0, 200)}${body.length > 200 ? '...' : ''}${imagePath ? '\n📎 + image' : ''}`
  ).catch(() => {});

  logger.info(`Ticket support #${ticket.id} cree par ${sanitizeUID(uid)}`);
  return attachImageUrls(ticket);
}

/**
 * Ajouter un message a un ticket (cote kine)
 */
async function addMessage(uid, ticketId, { body, imagePath = null }) {
  const prisma = prismaService.getInstance();

  const kine = await prisma.kine.findUnique({ where: { uid }, select: { id: true } });
  if (!kine) throw new Error('Kine non trouve');

  const ticket = await prisma.supportTicket.findFirst({
    where: { id: ticketId, kineId: kine.id }
  });
  if (!ticket) return null;

  const message = await prisma.ticketMessage.create({
    data: { body, isAdmin: false, imagePath, ticketId }
  });

  // Reouvrir le ticket si resolu
  if (ticket.status === 'RESOLVED') {
    await prisma.supportTicket.update({
      where: { id: ticketId },
      data: { status: 'OPEN', resolvedAt: null }
    });
  }

  message.imageUrl = imagePath ? await gcsStorageService.generateSignedUrl(imagePath) : null;
  return message;
}

/**
 * Recuperer les tickets d'un kine
 */
async function getTickets(uid) {
  const prisma = prismaService.getInstance();

  const kine = await prisma.kine.findUnique({ where: { uid }, select: { id: true } });
  if (!kine) throw new Error('Kine non trouve');

  const tickets = await prisma.supportTicket.findMany({
    where: { kineId: kine.id },
    include: {
      messages: { orderBy: { createdAt: 'asc' } }
    },
    orderBy: { updatedAt: 'desc' },
    take: 50
  });

  return attachImageUrls(tickets);
}

/**
 * Recuperer un ticket par ID (cote kine, avec verification ownership)
 */
async function getTicketById(uid, ticketId) {
  const prisma = prismaService.getInstance();

  const kine = await prisma.kine.findUnique({ where: { uid }, select: { id: true } });
  if (!kine) throw new Error('Kine non trouve');

  const ticket = await prisma.supportTicket.findFirst({
    where: { id: ticketId, kineId: kine.id },
    include: {
      messages: { orderBy: { createdAt: 'asc' } }
    }
  });

  if (!ticket) return null;
  return attachImageUrls(ticket);
}

/**
 * Cloturer un ticket (cote kine) — purge les pieces jointes
 */
async function closeTicket(uid, ticketId) {
  const prisma = prismaService.getInstance();

  const kine = await prisma.kine.findUnique({ where: { uid }, select: { id: true } });
  if (!kine) throw new Error('Kine non trouve');

  const ticket = await prisma.supportTicket.findFirst({
    where: { id: ticketId, kineId: kine.id }
  });
  if (!ticket) return null;

  await purgeTicketImages(prisma, ticketId);

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

  const tickets = await prisma.supportTicket.findMany({
    where: { status: 'OPEN' },
    include: {
      kine: { select: { id: true, firstName: true, lastName: true, email: true, planType: true } },
      messages: { orderBy: { createdAt: 'asc' } }
    },
    orderBy: { updatedAt: 'asc' },
    take: 50
  });

  return attachImageUrls(tickets);
}

/**
 * Repondre a un ticket (admin)
 */
async function adminReply(ticketId, { body, imagePath = null }) {
  const prisma = prismaService.getInstance();

  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    select: { id: true, subject: true, kineId: true }
  });
  if (!ticket) return null;

  const message = await prisma.ticketMessage.create({
    data: { body, isAdmin: true, imagePath, ticketId }
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
  message.imageUrl = imagePath ? await gcsStorageService.generateSignedUrl(imagePath) : null;
  return message;
}

/**
 * Modifier un message envoye par l'admin (texte + gestion image)
 * @param {object} opts - { body, newImagePath, removeImage }
 * @returns {Promise<object|null|{forbidden:true}>}
 */
async function adminUpdateMessage(messageId, { body, newImagePath = null, removeImage = false }) {
  const prisma = prismaService.getInstance();

  const message = await prisma.ticketMessage.findUnique({ where: { id: messageId } });
  if (!message) return null;
  if (!message.isAdmin) return { forbidden: true };

  let imagePath = message.imagePath;

  if (newImagePath) {
    // Remplacement : supprimer l'ancienne image si presente
    if (message.imagePath) {
      try { await gcsStorageService.deleteSupportImage(message.imagePath); }
      catch (err) { logger.warn(`Suppression ancienne image support echouee: ${err.message}`); }
    }
    imagePath = newImagePath;
  } else if (removeImage && message.imagePath) {
    try { await gcsStorageService.deleteSupportImage(message.imagePath); }
    catch (err) { logger.warn(`Suppression image support echouee: ${err.message}`); }
    imagePath = null;
  }

  const updated = await prisma.ticketMessage.update({
    where: { id: messageId },
    data: { body, imagePath }
  });

  logger.info(`Message admin #${messageId} modifie`);
  updated.imageUrl = imagePath ? await gcsStorageService.generateSignedUrl(imagePath) : null;
  return updated;
}

/**
 * Supprimer un message envoye par l'admin (+ son image GCS eventuelle)
 * @returns {Promise<object|null|{forbidden:true}>}
 */
async function adminDeleteMessage(messageId) {
  const prisma = prismaService.getInstance();

  const message = await prisma.ticketMessage.findUnique({ where: { id: messageId } });
  if (!message) return null;
  if (!message.isAdmin) return { forbidden: true };

  if (message.imagePath) {
    try { await gcsStorageService.deleteSupportImage(message.imagePath); }
    catch (err) { logger.warn(`Suppression image support echouee: ${err.message}`); }
  }

  await prisma.ticketMessage.delete({ where: { id: messageId } });
  logger.info(`Message admin #${messageId} supprime`);
  return { success: true };
}

/**
 * Marquer un ticket comme resolu (admin) — purge les pieces jointes
 */
async function resolveTicket(ticketId) {
  const prisma = prismaService.getInstance();

  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    select: { id: true, subject: true, kineId: true }
  });
  if (!ticket) return null;

  await purgeTicketImages(prisma, ticketId);

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
  adminUpdateMessage,
  adminDeleteMessage,
  resolveTicket
};
