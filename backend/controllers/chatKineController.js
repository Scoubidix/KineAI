// controllers/chatKineController.js
const chatKineService = require('../services/chatKineService');

class ChatKineController {
  async sendMessage(req, res) {
    try {
      const { message } = req.body;
      const firebaseUid = req.uid;
      
      if (!firebaseUid) {
        return res.status(401).json({ 
          error: 'Authentification échouée - UID manquant'
        });
      }

      // Récupérer le kineId depuis la base de données avec l'UID Firebase
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();
      
      const kine = await prisma.kine.findUnique({
        where: { uid: firebaseUid }
      });
      
      if (!kine) {
        return res.status(404).json({ 
          error: 'Kiné non trouvé' 
        });
      }
      
      const kineId = kine.id;

      if (!message?.trim()) {
        return res.status(400).json({ error: 'Message requis' });
      }

      const response = await chatKineService.sendMessage(kineId, message);
      
      res.json({ 
        success: true, 
        response: response 
      });
    } catch (error) {
      console.error('Erreur ChatKineController:', error.message);
      res.status(500).json({ 
        error: 'Erreur serveur',
        details: error.message 
      });
    }
  }

  async getHistory(req, res) {
    try {
      const firebaseUid = req.uid;
      
      if (!firebaseUid) {
        return res.status(401).json({ 
          error: 'Authentification échouée - UID manquant' 
        });
      }

      // Récupérer le kineId depuis la base de données
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();
      
      const kine = await prisma.kine.findUnique({
        where: { uid: firebaseUid }
      });
      
      if (!kine) {
        return res.status(404).json({ 
          error: 'Kiné non trouvé' 
        });
      }
      
      const kineId = kine.id;
      const days = parseInt(req.query.days) || 5;

      const history = await chatKineService.getHistory(kineId, days);
      
      res.json({ 
        success: true, 
        history: history 
      });
    } catch (error) {
      console.error('Erreur getHistory:', error.message);
      res.status(500).json({ 
        error: 'Erreur serveur',
        details: error.message 
      });
    }
  }

  async clearHistory(req, res) {
    try {
      const firebaseUid = req.uid;
      
      if (!firebaseUid) {
        return res.status(401).json({ 
          error: 'Authentification échouée - UID manquant' 
        });
      }

      // Récupérer le kineId depuis la base de données
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();
      
      const kine = await prisma.kine.findUnique({
        where: { uid: firebaseUid }
      });
      
      if (!kine) {
        return res.status(404).json({ 
          error: 'Kiné non trouvé' 
        });
      }
      
      const kineId = kine.id;

      await chatKineService.clearHistory(kineId);
      
      res.json({ 
        success: true, 
        message: 'Historique supprimé' 
      });
    } catch (error) {
      console.error('Erreur clearHistory:', error.message);
      res.status(500).json({ 
        error: 'Erreur serveur',
        details: error.message 
      });
    }
  }
}

module.exports = new ChatKineController();