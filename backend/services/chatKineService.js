// services/chatKineService.js
const { OpenAI } = require('openai');
const { PrismaClient } = require('@prisma/client');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const prisma = new PrismaClient();

class ChatKineService {
  async sendMessage(kineId, message) {
    try {
      // Récupérer l'historique des 5 derniers jours
      const fiveDaysAgo = new Date();
      fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
      
      const history = await prisma.chatKine.findMany({
        where: {
          kineId: kineId,
          createdAt: {
            gte: fiveDaysAgo
          }
        },
        orderBy: {
          createdAt: 'asc'
        },
        take: 20 // Limiter à 20 messages max
      });

      // Construire le contexte avec l'historique
      const conversation = history.map(chat => [
        { role: 'user', content: chat.message },
        { role: 'assistant', content: chat.response }
      ]).flat();

      // Ajouter le nouveau message
      conversation.push({ role: 'user', content: message });

      // Appel à OpenAI avec la nouvelle API
      const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: `Tu es un assistant IA spécialisé pour les kinésithérapeutes. 
            Tu aides à la gestion des patients, programmes de rééducation, et questions professionnelles.
            
            Tu peux aider avec :
            - Conseils sur les programmes de rééducation
            - Questions sur les pathologies courantes
            - Suggestions d'exercices thérapeutiques
            - Gestion administrative des patients
            - Bonnes pratiques en kinésithérapie
            
            Reste dans ton domaine d'expertise et redirige vers un médecin si nécessaire.
            Réponds de manière professionnelle mais bienveillante.
            
            Si on te pose des questions non liées à la kinésithérapie, rappelle poliment que tu es spécialisé dans ce domaine.`
          },
          ...conversation
        ],
        max_tokens: 500,
        temperature: 0.7,
        presence_penalty: 0.2,
        frequency_penalty: 0.1
      });

      const aiResponse = response.choices[0].message.content;

      // Sauvegarder dans la base
      await prisma.chatKine.create({
        data: {
          kineId: kineId,
          message: message,
          response: aiResponse
        }
      });

      return aiResponse;
      
    } catch (error) {
      console.error('Erreur ChatKineService:', error.message);
      
      // Messages d'erreur plus spécifiques
      if (error.code === 'insufficient_quota') {
        throw new Error('Quota OpenAI dépassé. Veuillez contacter l\'administrateur.');
      } else if (error.code === 'rate_limit_exceeded') {
        throw new Error('Trop de requêtes. Veuillez patienter quelques secondes.');
      } else if (error.message.includes('API key')) {
        throw new Error('Problème de configuration OpenAI.');
      }
      
      throw new Error('Erreur lors de la génération de la réponse');
    }
  }

  async getHistory(kineId, days = 5) {
    try {
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - days);

      const history = await prisma.chatKine.findMany({
        where: {
          kineId: kineId,
          createdAt: {
            gte: daysAgo
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      return history;
      
    } catch (error) {
      console.error('Erreur ChatKineService getHistory:', error.message);
      throw new Error('Erreur lors de la récupération de l\'historique');
    }
  }

  async clearHistory(kineId) {
    try {
      const result = await prisma.chatKine.deleteMany({
        where: {
          kineId: kineId
        }
      });

      return result;
      
    } catch (error) {
      console.error('Erreur ChatKineService clearHistory:', error.message);
      throw new Error('Erreur lors de la suppression de l\'historique');
    }
  }
}

// IMPORTANT: Export d'une instance de la classe
module.exports = new ChatKineService();