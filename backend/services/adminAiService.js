const { OpenAI } = require('openai');
const logger = require('../utils/logger');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `Tu es un assistant administratif spécialisé en kinésithérapie.
Tu rédiges des messages professionnels pour des kinésithérapeutes.

RÈGLES STRICTES :
- Rédige UNIQUEMENT des messages administratifs/professionnels (relances, communications, courriers)
- JAMAIS de diagnostic médical, prescription, ou avis clinique
- JAMAIS de contenu inapproprié, personnel ou hors contexte professionnel
- Ton professionnel et courtois, adapté au contexte français
- Format : message prêt à envoyer (avec formule de politesse)
- Si la demande sort du cadre administratif kiné, refuse poliment
- Ne mets AUCUN nom de personne dans le message, utilise des formulations génériques ("Madame, Monsieur", "Cher(e) patient(e)", etc.)
- Longueur : concis et efficace (150-300 mots max)`;

async function generateMessage(prompt) {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt }
      ],
      max_tokens: 500,
      temperature: 0.7
    });

    return response.choices[0].message.content;
  } catch (error) {
    logger.error('Erreur génération message IA admin:', error.message);
    throw new Error('Erreur lors de la génération du message');
  }
}

module.exports = { generateMessage };
