// services/conversationService.js
// Stockage des conversations du chat unifié (CRUD + persistance des messages).
// Aucune logique LLM ici — uniquement Prisma. Pattern ownership : tout est scoped kineId.
const prismaService = require('./prismaService');

const TITLE_MAX_CHARS = 100;

/**
 * Crée une conversation vide pour un kiné.
 */
const createConversation = async (kineId) => {
  const prisma = prismaService.getInstance();
  return prisma.conversation.create({
    data: { kineId }
  });
};

/**
 * Retrouve une conversation appartenant au kiné (active uniquement). Null sinon.
 */
const findOwnedConversation = async (kineId, conversationId) => {
  const prisma = prismaService.getInstance();
  return prisma.conversation.findFirst({
    where: { id: conversationId, kineId, isActive: true }
  });
};

/**
 * Liste les conversations actives d'un kiné, triées par dernière activité.
 */
const listConversations = async (kineId, { limit = 30, cursor } = {}) => {
  const prisma = prismaService.getInstance();
  return prisma.conversation.findMany({
    where: { kineId, isActive: true },
    orderBy: { updatedAt: 'desc' },
    take: limit,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    select: { id: true, title: true, updatedAt: true }
  });
};

/**
 * Conversation + messages en ordre chronologique. Null si non possédée/inactive.
 */
const getConversationWithMessages = async (kineId, conversationId) => {
  const prisma = prismaService.getInstance();
  return prisma.conversation.findFirst({
    where: { id: conversationId, kineId, isActive: true },
    include: {
      messages: {
        orderBy: { createdAt: 'asc' },
        select: { id: true, role: true, content: true, iaType: true, ragUsed: true, createdAt: true }
      }
    }
  });
};

/**
 * Renomme une conversation (ownership vérifiée). Retourne null si non trouvée.
 */
const renameConversation = async (kineId, conversationId, title) => {
  const prisma = prismaService.getInstance();
  const conversation = await findOwnedConversation(kineId, conversationId);
  if (!conversation) return null;

  return prisma.conversation.update({
    where: { id: conversation.id },
    data: { title: title.trim().substring(0, TITLE_MAX_CHARS) }
  });
};

/**
 * Soft delete (convention projet : isActive false + deletedAt). Retourne null si non trouvée.
 */
const softDeleteConversation = async (kineId, conversationId) => {
  const prisma = prismaService.getInstance();
  const conversation = await findOwnedConversation(kineId, conversationId);
  if (!conversation) return null;

  return prisma.conversation.update({
    where: { id: conversation.id },
    data: { isActive: false, deletedAt: new Date() }
  });
};

/**
 * Historique d'une conversation pour le LLM ({ role, content }, ordre chronologique).
 * Ancrage du premier échange : si la conversation dépasse la fenêtre, les 2 premiers
 * messages (le cas initial + la première réponse) sont conservés en tête et remplacent
 * les plus anciens de la fenêtre glissante — l'info la plus précieuse d'une conversation
 * clinique est souvent posée au premier message.
 */
const getLastMessages = async (conversationId, limit) => {
  const prisma = prismaService.getInstance();
  const recent = await prisma.conversationMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: { id: true, role: true, content: true }
  });
  const recentChrono = recent.reverse();

  // Fenêtre pleine → la conversation peut être plus longue : ancrer le premier échange
  if (recentChrono.length === limit) {
    const firstMessages = await prisma.conversationMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      take: 2,
      select: { id: true, role: true, content: true }
    });

    const recentIds = new Set(recentChrono.map((m) => m.id));
    const anchors = firstMessages.filter((m) => !recentIds.has(m.id));

    if (anchors.length > 0) {
      // Les ancres remplacent les plus anciens de la fenêtre (total ≤ limit)
      const merged = [...anchors, ...recentChrono.slice(anchors.length)];
      return merged.map(({ role, content }) => ({ role, content }));
    }
  }

  return recentChrono.map(({ role, content }) => ({ role, content }));
};

/**
 * Sauvegarde le message utilisateur (avant génération — survit à un échec LLM).
 */
const saveUserMessage = async (conversationId, content) => {
  const prisma = prismaService.getInstance();
  return prisma.conversationMessage.create({
    data: { conversationId, role: 'user', content }
  });
};

/**
 * Sauvegarde la réponse assistant (après réponse complète) + touch updatedAt de la conversation.
 */
const saveAssistantMessage = async (conversationId, { content, iaType, ragUsed, model, tokensUsed }) => {
  const prisma = prismaService.getInstance();
  const message = await prisma.conversationMessage.create({
    data: { conversationId, role: 'assistant', content, iaType, ragUsed, model, tokensUsed }
  });

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() }
  });

  return message;
};

/**
 * Pose le titre uniquement s'il est encore vide (le renommage manuel garde la priorité).
 */
const setTitleIfEmpty = async (conversationId, title) => {
  const prisma = prismaService.getInstance();
  return prisma.conversation.updateMany({
    where: { id: conversationId, title: null },
    data: { title: title.trim().substring(0, TITLE_MAX_CHARS) }
  });
};

module.exports = {
  createConversation,
  findOwnedConversation,
  listConversations,
  getConversationWithMessages,
  renameConversation,
  softDeleteConversation,
  getLastMessages,
  saveUserMessage,
  saveAssistantMessage,
  setTitleIfEmpty,
  TITLE_MAX_CHARS
};
