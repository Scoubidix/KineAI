const { OpenAI } = require('openai');
const logger = require('../utils/logger');

// Modèle Mistral épinglé : version 3.5 / 26.04 (PAS d'alias -latest, pour éviter une dérive silencieuse)
const MISTRAL_MODEL = 'mistral-medium-3-5';
const MISTRAL_BASE_URL = 'https://api.mistral.ai/v1';

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

// Provider résolu à CHAQUE appel (pas caché au chargement) pour rester testable et flexible.
function resolveProvider() {
  return process.env.GENERATION_PROVIDER === 'mistral' ? 'mistral' : 'openai';
}

function resolveConfig(iaType, provider) {
  const entry = GENERATION_CONFIG[iaType] || GENERATION_CONFIG.default;
  return entry[provider];
}

/**
 * Génère une complétion de chat via le provider de génération actif.
 * @param {Object} p
 * @param {string} p.iaType - clé de GENERATION_CONFIG (basique, biblio, clinique, admin, followup, admin_message)
 * @param {Array} p.messages - messages OpenAI-style ({role, content})
 * @param {boolean} [p.stream=false] - active le streaming
 * @param {Function} [p.onToken] - callback(delta) appelé par token en mode streaming
 * @returns {Promise<{content: string, usage: object|null, model: string, provider: string}>}
 */
async function chatCompletion({ iaType, messages, stream = false, onToken }) {
  const provider = resolveProvider();
  const client = provider === 'mistral' ? getMistralClient() : openaiClient;
  const cfg = resolveConfig(iaType, provider);

  const params = {
    model: cfg.model,
    messages,
    max_tokens: cfg.max_tokens,
    temperature: cfg.temperature,
    presence_penalty: cfg.presence_penalty ?? 0.1,
    frequency_penalty: cfg.frequency_penalty ?? 0.1,
  };

  if (!stream) {
    const completion = await client.chat.completions.create(params);
    return {
      content: completion.choices[0].message.content,
      usage: completion.usage || null,
      model: cfg.model,
      provider,
    };
  }

  const streamResp = await client.chat.completions.create({ ...params, stream: true });
  let content = '';
  let usage = null;
  for await (const chunk of streamResp) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) {
      content += delta;
      if (onToken) onToken(delta);
    }
    if (chunk.usage) usage = chunk.usage; // usage parfois renvoyé sur le dernier chunk
  }
  logger.debug(`🤖 llmService stream terminé (provider=${provider}, model=${cfg.model})`);
  return { content, usage, model: cfg.model, provider };
}

module.exports = { chatCompletion, GENERATION_CONFIG };
