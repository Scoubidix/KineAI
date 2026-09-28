const { OpenAI } = require('openai');
const logger = require('../utils/logger');

// Fournisseurs disponibles pour la génération :
// - GENERATION_PROVIDER=openai|mistral pilote le provider par défaut (tous les iaTypes).
// - STRUCTURED_PROVIDER=openrouter route en plus bilan_extract et bilan_dictation_correct vers
//   OpenRouter/DeepSeek (clé OPENROUTER_API_KEY) ; toute autre valeur/absence laisse le comportement
//   par défaut strictement inchangé. Repli automatique sur le provider par défaut si OpenRouter échoue.

// Modèle Mistral épinglé : version 3.5 / 26.04 (PAS d'alias -latest, pour éviter une dérive silencieuse)
const MISTRAL_MODEL = 'mistral-medium-3-5';
const MISTRAL_BASE_URL = 'https://api.mistral.ai/v1';

// Modèle DeepSeek épinglé (via OpenRouter), PAS d'alias -latest (même principe que Mistral)
const OPENROUTER_MODEL = 'deepseek/deepseek-v4.1-flash';
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

// Corps de requête OpenRouter : uniquement des fournisseurs zéro rétention qui n'utilisent pas les
// données, exclusion de ceux qui ignoreraient un paramètre, tri par latence (écarts 2-30s mesurés).
const OPENROUTER_PROVIDER_PREFS = { zdr: true, data_collection: 'deny', require_parameters: true, sort: 'latency' };
const OPENROUTER_REASONING = { enabled: false };

// Seuls ces iaTypes sont routables vers OpenRouter derrière l'interrupteur STRUCTURED_PROVIDER
const OPENROUTER_ROUTED_IA_TYPES = ['bilan_extract', 'bilan_dictation_correct'];

// Table modèle/params par IA et par provider. Source UNIQUE de vérité.
// presence_penalty / frequency_penalty valent 0.1 par défaut (cf. chatCompletion),
// sauf admin_message qui les force à 0 pour rester fidèle au comportement existant.
const GENERATION_CONFIG = {
  basique: {
    openai: { model: 'gpt-4o-mini', max_tokens: 750, temperature: 0.5 },
    mistral: { model: MISTRAL_MODEL, max_tokens: 750, temperature: 0.5 },
  },
  biblio: {
    openai: { model: 'gpt-4o-mini', max_tokens: 2000, temperature: 0.3 },
    mistral: { model: MISTRAL_MODEL, max_tokens: 2000, temperature: 0.3 },
  },
  clinique: {
    openai: { model: 'gpt-4.1-mini', max_tokens: 2000, temperature: 0.3 },
    mistral: { model: MISTRAL_MODEL, max_tokens: 2000, temperature: 0.3 },
  },
  admin: {
    openai: { model: 'gpt-4o-mini', max_tokens: 3000, temperature: 0.2 },
    mistral: { model: MISTRAL_MODEL, max_tokens: 3000, temperature: 0.2 },
  },
  followup: {
    openai: { model: 'gpt-4o-mini', max_tokens: 750, temperature: 0.5 },
    mistral: { model: MISTRAL_MODEL, max_tokens: 750, temperature: 0.5 },
  },
  admin_message: {
    openai: { model: 'gpt-4o-mini', max_tokens: 500, temperature: 0.7, presence_penalty: 0, frequency_penalty: 0 },
    mistral: { model: MISTRAL_MODEL, max_tokens: 500, temperature: 0.7, presence_penalty: 0, frequency_penalty: 0 },
  },
  // Bilan V1 (extraction des mesures / rédaction des sections) : sortie JSON, température 0,
  // pénalités 0 (on veut une transcription fidèle, pas de la variété lexicale).
  bilan_extract: {
    openai: { model: 'gpt-4.1-mini', max_tokens: 4000, temperature: 0, presence_penalty: 0, frequency_penalty: 0 },
    mistral: { model: MISTRAL_MODEL, max_tokens: 4000, temperature: 0, presence_penalty: 0, frequency_penalty: 0 },
    openrouter: { model: OPENROUTER_MODEL, max_tokens: 4000, temperature: 0, presence_penalty: 0, frequency_penalty: 0 },
  },
  bilan_compose: {
    openai: { model: 'gpt-4.1-mini', max_tokens: 3000, temperature: 0, presence_penalty: 0, frequency_penalty: 0 },
    mistral: { model: MISTRAL_MODEL, max_tokens: 3000, temperature: 0, presence_penalty: 0, frequency_penalty: 0 },
  },
  // Passe de correction de la dictée : opérations JSON, température 0, sortie courte
  bilan_dictation_correct: {
    openai: { model: 'gpt-4.1-mini', max_tokens: 1500, temperature: 0, presence_penalty: 0, frequency_penalty: 0 },
    mistral: { model: MISTRAL_MODEL, max_tokens: 1500, temperature: 0, presence_penalty: 0, frequency_penalty: 0 },
    openrouter: { model: OPENROUTER_MODEL, max_tokens: 1500, temperature: 0, presence_penalty: 0, frequency_penalty: 0 },
  },
  default: {
    openai: { model: 'gpt-4o-mini', max_tokens: 1000, temperature: 0.7 },
    mistral: { model: MISTRAL_MODEL, max_tokens: 1000, temperature: 0.7 },
  },
};

// Client OpenAI (existant) instancié au chargement
const openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Client Mistral instancié paresseusement : le SDK exige une clé non vide à la construction,
// on évite donc tout crash au boot quand on tourne sur OpenAI sans MISTRAL_API_KEY.
let _mistralClient = null;
function getMistralClient() {
  if (!_mistralClient) {
    if (!process.env.MISTRAL_API_KEY) {
      throw new Error('MISTRAL_API_KEY manquante alors que GENERATION_PROVIDER=mistral');
    }
    _mistralClient = new OpenAI({ apiKey: process.env.MISTRAL_API_KEY, baseURL: MISTRAL_BASE_URL });
  }
  return _mistralClient;
}

// Client OpenRouter instancié paresseusement (même logique que le client Mistral : pas de crash
// au boot quand l'interrupteur STRUCTURED_PROVIDER est off et qu'OPENROUTER_API_KEY est absente).
let _openRouterClient = null;
function getOpenRouterClient() {
  if (!_openRouterClient) {
    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY manquante alors que STRUCTURED_PROVIDER=openrouter');
    }
    _openRouterClient = new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: OPENROUTER_BASE_URL,
      timeout: 30000,
      maxRetries: 1,
    });
  }
  return _openRouterClient;
}

function getClient(provider) {
  if (provider === 'mistral') return getMistralClient();
  if (provider === 'openrouter') return getOpenRouterClient();
  return openaiClient;
}

// Provider résolu à CHAQUE appel (pas caché au chargement) pour rester testable et flexible.
function resolveProvider() {
  return process.env.GENERATION_PROVIDER === 'mistral' ? 'mistral' : 'openai';
}

// Routage par tâche vers OpenRouter, derrière l'interrupteur STRUCTURED_PROVIDER. Le streaming n'est
// jamais routé (bilan_extract/bilan_dictation_correct n'appellent jamais en stream ; pas de nouvelle
// surface pour ce cas).
function resolveStructuredProvider(iaType, stream) {
  if (stream) return null;
  if (process.env.STRUCTURED_PROVIDER !== 'openrouter') return null;
  if (!OPENROUTER_ROUTED_IA_TYPES.includes(iaType)) return null;
  return 'openrouter';
}

function resolveConfig(iaType, provider) {
  const entry = GENERATION_CONFIG[iaType] || GENERATION_CONFIG.default;
  return entry[provider];
}

function buildParams(provider, cfg, messages, jsonSchema) {
  const params = {
    model: cfg.model,
    messages,
    max_tokens: cfg.max_tokens,
    temperature: cfg.temperature,
    presence_penalty: cfg.presence_penalty ?? 0.1,
    frequency_penalty: cfg.frequency_penalty ?? 0.1,
  };
  if (provider === 'openrouter') {
    params.provider = OPENROUTER_PROVIDER_PREFS;
    params.reasoning = OPENROUTER_REASONING;
  }
  if (jsonSchema) {
    // Mistral et OpenRouter (API compatibles OpenAI) ne supportent pas json_schema strict :
    // json_object + Zod côté appelant
    params.response_format = provider === 'openai'
      ? { type: 'json_schema', json_schema: { name: jsonSchema.name, strict: true, schema: jsonSchema.schema } }
      : { type: 'json_object' };
  }
  return params;
}

// Un seul appel non-stream, réutilisé pour la tentative primaire et pour le repli.
async function runCompletion({ provider, iaType, messages, jsonSchema, stream }) {
  const client = getClient(provider);
  const cfg = resolveConfig(iaType, provider);
  logger.info(`🤖 Génération LLM → provider=${provider} | model=${cfg.model} | iaType=${iaType} | stream=${stream}`);
  const params = buildParams(provider, cfg, messages, jsonSchema);
  const completion = await client.chat.completions.create(params);
  const finishReason = completion.choices[0].finish_reason ?? null;
  if (finishReason === 'length') {
    logger.warn(`✂️ Réponse tronquée par max_tokens (${cfg.max_tokens}) — iaType=${iaType}, model=${cfg.model}`);
  }
  return {
    content: completion.choices[0].message.content,
    usage: completion.usage || null,
    model: cfg.model,
    provider,
    finishReason,
  };
}

/**
 * Génère une complétion de chat via le provider de génération actif.
 * @param {Object} p
 * @param {string} p.iaType - clé de GENERATION_CONFIG (basique, biblio, clinique, admin, followup, admin_message, bilan_extract, bilan_compose, bilan_dictation_correct)
 * @param {Array} p.messages - messages OpenAI-style ({role, content})
 * @param {boolean} [p.stream=false] - active le streaming
 * @param {Function} [p.onToken] - callback(delta) appelé par token en mode streaming
 * @param {{name: string, schema: object}} [p.jsonSchema] - sortie JSON contrainte : json_schema strict (OpenAI)
 *   ou json_object (Mistral/OpenRouter). L'appelant valide toujours le JSON reçu (Zod). Incompatible avec stream.
 * @returns {Promise<{content: string, usage: object|null, model: string, provider: string}>}
 */
async function chatCompletion({ iaType, messages, stream = false, onToken, jsonSchema }) {
  if (jsonSchema && stream) throw new Error('jsonSchema est incompatible avec le streaming');

  const defaultProvider = resolveProvider();
  const structuredProvider = resolveStructuredProvider(iaType, stream);
  const provider = structuredProvider || defaultProvider;

  if (!stream) {
    try {
      return await runCompletion({ provider, iaType, messages, jsonSchema, stream });
    } catch (err) {
      if (provider !== 'openrouter') throw err;
      // Repli sur le provider par défaut : warn SANS contenu (iaType, statut, code uniquement).
      // Une erreur du repli remonte telle quelle (pas de second catch).
      logger.warn(`⚠️ Échec OpenRouter, repli sur ${defaultProvider} — iaType=${iaType} | status=${err.status ?? 'n/a'} | code=${err.code ?? 'n/a'}`);
      return await runCompletion({ provider: defaultProvider, iaType, messages, jsonSchema, stream });
    }
  }

  const client = getClient(provider);
  const cfg = resolveConfig(iaType, provider);
  logger.info(`🤖 Génération LLM → provider=${provider} | model=${cfg.model} | iaType=${iaType} | stream=${stream}`);
  const params = buildParams(provider, cfg, messages, jsonSchema);

  const streamResp = await client.chat.completions.create({ ...params, stream: true });
  let content = '';
  let usage = null;
  let finishReason = null;
  for await (const chunk of streamResp) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) {
      content += delta;
      if (onToken) onToken(delta);
    }
    if (chunk.choices[0]?.finish_reason) finishReason = chunk.choices[0].finish_reason;
    if (chunk.usage) usage = chunk.usage; // usage parfois renvoyé sur le dernier chunk
  }
  if (finishReason === 'length') {
    logger.warn(`✂️ Réponse tronquée par max_tokens (${cfg.max_tokens}) — iaType=${iaType}, model=${cfg.model}`);
  }
  logger.debug(`🤖 llmService stream terminé (provider=${provider}, model=${cfg.model})`);
  return { content, usage, model: cfg.model, provider, finishReason };
}

module.exports = { chatCompletion, GENERATION_CONFIG };
