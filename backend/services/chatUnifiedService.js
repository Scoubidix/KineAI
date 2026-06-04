// services/chatUnifiedService.js
// Orchestration d'un message du chat unifié (basique + biblio + clinique) :
// historique conversation → router → RAG → budget input → génération (llmService) → sauvegardes → titre.
// L'IA admin/bilan ne passe PAS par ici (page et flow séparés).
const logger = require('../utils/logger');
const llmService = require('./llmService');
const conversationService = require('./conversationService');
const knowledgeService = require('./knowledgeService');
const tokenUsageService = require('./tokenUsageService');
const { lookupGlossary } = require('./embeddingService');
const { routeQuery, getSystemPromptByType, generateConversationTitle } = require('./openaiService');

// Budget input (spec §8) — couche 2 et 3. La couche 1 (message ≤ 15 000 chars) est au contrôleur.
const HISTORY_LIMIT = 12;
const DOC_CONTENT_MAX_CHARS = 4000;
const INPUT_BUDGET_TOKENS = 40000;
const DOC_LIMITS = { basique: 3, biblio: 6, clinique: 6 };
const TITLE_FALLBACK_CHARS = 50;

// Estimation grossière : ~4 caractères par token (suffisant pour un garde-fou)
const estimateTokens = (messages) =>
  Math.ceil(messages.reduce((sum, m) => sum + (m.content?.length || 0), 0) / 4);

/**
 * Élague l'historique (plus anciens d'abord) jusqu'à passer sous le budget input.
 * Ne touche jamais au prompt système (1er) ni au message user (dernier).
 */
const enforceInputBudget = (messages) => {
  const pruned = [...messages];
  while (estimateTokens(pruned) > INPUT_BUDGET_TOKENS && pruned.length > 2) {
    pruned.splice(1, 1); // retire le message d'historique le plus ancien
  }
  if (pruned.length !== messages.length) {
    logger.warn(`✂️ Budget input dépassé : historique élagué de ${messages.length - pruned.length} message(s)`);
  }
  return pruned;
};

/**
 * Génère le titre en arrière-plan (fire-and-forget). Fallback : troncature du message user.
 */
const generateTitleInBackground = (conversationId, userMessage, assistantResponse) => {
  generateConversationTitle(userMessage, assistantResponse)
    .then((title) => conversationService.setTitleIfEmpty(conversationId, title))
    .catch((error) => {
      logger.warn(`⚠️ Titre LLM échoué (conversation ${conversationId}), fallback troncature:`, error.message);
      return conversationService.setTitleIfEmpty(conversationId, userMessage.substring(0, TITLE_FALLBACK_CHARS));
    })
    .catch((error) => logger.error('❌ Échec du fallback titre:', error.message));
};

/**
 * Flow complet d'un message du chat unifié (spec §6), en streaming.
 * @param {Object} p
 * @param {number} p.kineId
 * @param {number} [p.conversationId] - absent → nouvelle conversation
 * @param {string} p.message
 * @param {Function} p.onEvent - (eventName, payload) → écrit le SSE côté contrôleur
 * @returns {Object} payload de l'event done
 */
const sendMessageStream = async ({ kineId, conversationId, message, onEvent }) => {
  // 1. Conversation : création ou ownership
  let conversation;
  let isNewConversation = false;
  if (conversationId) {
    conversation = await conversationService.findOwnedConversation(kineId, conversationId);
    if (!conversation) {
      const error = new Error('Conversation non trouvée');
      error.code = 'NOT_FOUND';
      throw error;
    }
  } else {
    conversation = await conversationService.createConversation(kineId);
    isNewConversation = true;
    onEvent('conversation_created', { conversationId: conversation.id });
  }

  // 2. Historique de la conversation (chronologique, format LLM)
  const history = isNewConversation
    ? []
    : await conversationService.getLastMessages(conversation.id, HISTORY_LIMIT);

  // 3. Router : type d'IA + besoin RAG + query de recherche réécrite
  const route = await routeQuery(message, history);
  logger.info(`🔀 Chat unifié → type=${route.type} | rag=${route.rag} | conversation=${conversation.id}`);

  // Informe le frontend du type routé dès maintenant (phrases d'attente spécifiques à l'IA)
  onEvent('routed', { iaType: route.type, rag: route.rag });

  // 4. Recherche documentaire si RAG
  let documents = [];
  let selectedSources = [];
  if (route.rag) {
    const searchResult = await knowledgeService.searchDocuments(route.query, {
      filterCategory: null,
      allowLowerThreshold: true,
      iaType: route.type
    });
    const maxDocs = DOC_LIMITS[route.type] || 3;
    documents = (searchResult.allDocuments || [])
      .slice(0, maxDocs)
      .map((doc) => ({
        ...doc,
        content: doc.content ? doc.content.substring(0, DOC_CONTENT_MAX_CHARS) : doc.content
      }));
    selectedSources = searchResult.selectedSources || [];
  }

  // 5. Message user sauvegardé AVANT génération (survit à un échec) — version originale
  await conversationService.saveUserMessage(conversation.id, message);

  // 5bis. Glossaire FR→EN : enrichit le message envoyé au LLM (les docs RAG sont en anglais).
  // Repris de l'ancien prepareKineRequest ; la sauvegarde garde le message original.
  let llmMessage = message;
  if (route.rag && (route.type === 'biblio' || route.type === 'clinique')) {
    try {
      const glossaryMappings = await lookupGlossary(message);
      glossaryMappings.forEach((m) => {
        const regex = new RegExp(`\\b${m.french_term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
        llmMessage = llmMessage.replace(regex, `${m.english_term} (${m.french_term})`);
      });
      if (glossaryMappings.length > 0) {
        logger.debug(`📖 Glossaire : ${glossaryMappings.length} mapping(s) appliqué(s) au message LLM`);
      }
    } catch (error) {
      logger.warn('⚠️ Glossaire indisponible, message non enrichi:', error.message);
    }
  }

  // 6. Messages pour le LLM (prompt système du type routé + historique + user)
  const systemPrompt = getSystemPromptByType(route.type, documents, route.rag);
  let messages = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: llmMessage }
  ];

  // 7. Garde-fou budget input (élagage silencieux de l'historique)
  messages = enforceInputBudget(messages);

  // 8. Génération (Mistral/OpenAI selon GENERATION_PROVIDER)
  const completion = await llmService.chatCompletion({
    iaType: route.type,
    messages,
    stream: true,
    onToken: (delta) => onEvent('token', { content: delta })
  });

  // 9. Sauvegarde de la réponse assistant (avec métadonnées de traçabilité)
  const assistantMessage = await conversationService.saveAssistantMessage(conversation.id, {
    content: completion.content,
    iaType: route.type,
    ragUsed: route.rag,
    model: completion.model,
    tokensUsed: completion.usage?.total_tokens ?? null
  });

  // 9bis. Incrément du quota quotidien (APRÈS génération — jamais de coupure en cours de message)
  await tokenUsageService.incrementDailyUsage(kineId, completion.usage?.total_tokens ?? 0);

  // 10. Titre en arrière-plan si la conversation n'en a pas encore
  if (!conversation.title) {
    generateTitleInBackground(conversation.id, message, completion.content);
  }

  // 11. Payload de l'event done
  return {
    conversationId: conversation.id,
    messageId: assistantMessage.id,
    iaType: route.type,
    ragUsed: route.rag,
    sources: route.rag ? knowledgeService.formatSources(selectedSources) : [],
    confidence: route.rag && documents.length > 0
      ? knowledgeService.calculateOverallConfidence(documents)
      : null,
    usage: completion.usage,
    model: completion.model,
    provider: completion.provider
  };
};

module.exports = {
  sendMessageStream,
  // exportés pour les tests
  HISTORY_LIMIT,
  INPUT_BUDGET_TOKENS,
  DOC_CONTENT_MAX_CHARS
};
