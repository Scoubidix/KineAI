// controllers/chatKineController.js
const prismaService = require('../services/prismaService');
const { generateKineResponse, generateKineResponseStream, generateFollowupResponse, generateFollowupResponseStream } = require('../services/openaiService');
const logger = require('../utils/logger');

// Limites de caractères pour le mode preview (aperçu tronqué)
const PREVIEW_CHAR_LIMITS = {
  basique: 250,
  biblio: 400,
  clinique: 400,
  admin: 250
};

// ========== HANDLER UNIFIÉ ==========
const handleKineRequest = async (req, res, iaType) => {
  try {
    const { message, conversationHistory = [] } = req.body;
    const firebaseUid = req.uid;
    const isPreview = req.isPreview === true;

    // 1. Validation de l'authentification
    if (!firebaseUid) {
      return res.status(401).json({
        error: 'Authentification échouée - UID manquant'
      });
    }

    // 2. Récupération du kiné
    const prisma = prismaService.getInstance();
    const kine = await prisma.kine.findUnique({
      where: { uid: firebaseUid }
    });

    if (!kine) {
      return res.status(404).json({
        error: 'Kiné non trouvé'
      });
    }

    // 3. Validation du message
    if (!message?.trim()) {
      return res.status(400).json({ error: 'Message requis' });
    }

    // 4. Appel du service unifié
    const response = await generateKineResponse(iaType, message, conversationHistory, kine.id, { skipSave: isPreview });

    // 5. Ajout du firebaseUid dans les métadonnées
    response.metadata.firebaseUid = firebaseUid;

    // 6. Tronquer si mode preview
    if (isPreview) {
      const charLimit = PREVIEW_CHAR_LIMITS[iaType] || 250;
      response.message = response.message.substring(0, charLimit);
      response.preview = true;
    }

    res.json(response);

  } catch (error) {
    logger.error(`❌ Erreur handleKineRequest (${iaType}):`, error);
    
    const errorResponse = error.success === false ? error : {
      success: false,
      error: `Erreur lors de la génération de la réponse IA ${iaType}`,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    };
    
    res.status(500).json(errorResponse);
  }
};

// ========== ROUTES IA ==========
const sendIaBasique = async (req, res) => {
  await handleKineRequest(req, res, 'basique');
};

const sendIaBiblio = async (req, res) => {
  await handleKineRequest(req, res, 'biblio');
};

const sendIaClinique = async (req, res) => {
  await handleKineRequest(req, res, 'clinique');
};

const sendIaAdministrative = async (req, res) => {
  await handleKineRequest(req, res, 'admin');
};

// ========== STREAMING SSE (IA BASIQUE) ==========
const sendIaBasiqueStream = async (req, res) => {
  let headersSent = false;
  let clientDisconnected = false;
  const isPreview = req.isPreview === true;

  req.on('close', () => {
    clientDisconnected = true;
  });

  try {
    const { message, conversationHistory = [] } = req.body;
    const firebaseUid = req.uid;

    // 1. Validation
    if (!firebaseUid) {
      return res.status(401).json({ error: 'Authentification échouée - UID manquant' });
    }

    const prisma = prismaService.getInstance();
    const kine = await prisma.kine.findUnique({ where: { uid: firebaseUid } });

    if (!kine) {
      return res.status(404).json({ error: 'Kiné non trouvé' });
    }

    if (!message?.trim()) {
      return res.status(400).json({ error: 'Message requis' });
    }

    // 2. Headers SSE
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    headersSent = true;

    // 3. Stream avec callback onToken + troncature preview
    let charCount = 0;
    let previewEnded = false;
    const charLimit = PREVIEW_CHAR_LIMITS.basique;

    const result = await generateKineResponseStream(
      'basique',
      message,
      conversationHistory,
      kine.id,
      (delta) => {
        if (clientDisconnected || previewEnded) return;
        if (isPreview) {
          charCount += delta.length;
          if (charCount >= charLimit) {
            const remaining = charLimit - (charCount - delta.length);
            if (remaining > 0) {
              res.write(`event: token\ndata: ${JSON.stringify({ content: delta.substring(0, remaining) })}\n\n`);
            }
            res.write(`event: preview_end\ndata: ${JSON.stringify({ message: 'Abonnement requis pour la réponse complète', charLimit })}\n\n`);
            previewEnded = true;
            return;
          }
        }
        res.write(`event: token\ndata: ${JSON.stringify({ content: delta })}\n\n`);
      },
      { skipSave: isPreview }
    );

    // 4. Event done avec réponse complète (seulement si pas preview)
    if (!clientDisconnected && !previewEnded) {
      result.metadata.firebaseUid = firebaseUid;
      res.write(`event: done\ndata: ${JSON.stringify(result)}\n\n`);
    }
    if (!clientDisconnected) {
      res.end();
    }

  } catch (error) {
    logger.error('❌ Erreur sendIaBasiqueStream:', error);

    if (!headersSent) {
      const errorResponse = error.success === false ? error : {
        success: false,
        error: 'Erreur lors de la génération de la réponse IA basique',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      };
      return res.status(500).json(errorResponse);
    }

    if (!clientDisconnected) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: process.env.NODE_ENV === 'development' ? error.message : 'Erreur interne' })}\n\n`);
      res.end();
    }
  }
};

// ========== STREAMING SSE (IA BIBLIO) ==========
const sendIaBiblioStream = async (req, res) => {
  let headersSent = false;
  let clientDisconnected = false;
  const isPreview = req.isPreview === true;
  req.on('close', () => { clientDisconnected = true; });

  try {
    const { message, conversationHistory = [] } = req.body;
    const firebaseUid = req.uid;

    if (!firebaseUid) return res.status(401).json({ error: 'Authentification échouée - UID manquant' });
    const prisma = prismaService.getInstance();
    const kine = await prisma.kine.findUnique({ where: { uid: firebaseUid } });
    if (!kine) return res.status(404).json({ error: 'Kiné non trouvé' });
    if (!message?.trim()) return res.status(400).json({ error: 'Message requis' });

    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
    headersSent = true;

    let charCount = 0;
    let previewEnded = false;
    const charLimit = PREVIEW_CHAR_LIMITS.biblio;

    const result = await generateKineResponseStream('biblio', message, conversationHistory, kine.id, (delta) => {
      if (clientDisconnected || previewEnded) return;
      if (isPreview) {
        charCount += delta.length;
        if (charCount >= charLimit) {
          const remaining = charLimit - (charCount - delta.length);
          if (remaining > 0) res.write(`event: token\ndata: ${JSON.stringify({ content: delta.substring(0, remaining) })}\n\n`);
          res.write(`event: preview_end\ndata: ${JSON.stringify({ message: 'Abonnement requis pour la réponse complète', charLimit })}\n\n`);
          previewEnded = true;
          return;
        }
      }
      res.write(`event: token\ndata: ${JSON.stringify({ content: delta })}\n\n`);
    }, { skipSave: isPreview });

    if (!clientDisconnected && !previewEnded) {
      result.metadata.firebaseUid = firebaseUid;
      res.write(`event: done\ndata: ${JSON.stringify(result)}\n\n`);
    }
    if (!clientDisconnected) res.end();
  } catch (error) {
    logger.error('❌ Erreur sendIaBiblioStream:', error);
    if (!headersSent) {
      return res.status(500).json(error.success === false ? error : { success: false, error: 'Erreur IA biblio', details: error.message });
    }
    if (!clientDisconnected) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: process.env.NODE_ENV === 'development' ? error.message : 'Erreur interne' })}\n\n`);
      res.end();
    }
  }
};

// ========== STREAMING SSE (IA CLINIQUE) ==========
const sendIaCliniqueStream = async (req, res) => {
  let headersSent = false;
  let clientDisconnected = false;
  const isPreview = req.isPreview === true;
  req.on('close', () => { clientDisconnected = true; });

  try {
    const { message, conversationHistory = [] } = req.body;
    const firebaseUid = req.uid;

    if (!firebaseUid) return res.status(401).json({ error: 'Authentification échouée - UID manquant' });
    const prisma = prismaService.getInstance();
    const kine = await prisma.kine.findUnique({ where: { uid: firebaseUid } });
    if (!kine) return res.status(404).json({ error: 'Kiné non trouvé' });
    if (!message?.trim()) return res.status(400).json({ error: 'Message requis' });

    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
    headersSent = true;

    let charCount = 0;
    let previewEnded = false;
    const charLimit = PREVIEW_CHAR_LIMITS.clinique;

    const result = await generateKineResponseStream('clinique', message, conversationHistory, kine.id, (delta) => {
      if (clientDisconnected || previewEnded) return;
      if (isPreview) {
        charCount += delta.length;
        if (charCount >= charLimit) {
          const remaining = charLimit - (charCount - delta.length);
          if (remaining > 0) res.write(`event: token\ndata: ${JSON.stringify({ content: delta.substring(0, remaining) })}\n\n`);
          res.write(`event: preview_end\ndata: ${JSON.stringify({ message: 'Abonnement requis pour la réponse complète', charLimit })}\n\n`);
          previewEnded = true;
          return;
        }
      }
      res.write(`event: token\ndata: ${JSON.stringify({ content: delta })}\n\n`);
    }, { skipSave: isPreview });

    if (!clientDisconnected && !previewEnded) {
      result.metadata.firebaseUid = firebaseUid;
      res.write(`event: done\ndata: ${JSON.stringify(result)}\n\n`);
    }
    if (!clientDisconnected) res.end();
  } catch (error) {
    logger.error('❌ Erreur sendIaCliniqueStream:', error);
    if (!headersSent) {
      return res.status(500).json(error.success === false ? error : { success: false, error: 'Erreur IA clinique', details: error.message });
    }
    if (!clientDisconnected) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: process.env.NODE_ENV === 'development' ? error.message : 'Erreur interne' })}\n\n`);
      res.end();
    }
  }
};

// ========== STREAMING SSE (FOLLOWUP) ==========
const sendIaFollowupStream = async (req, res) => {
  let headersSent = false;
  let clientDisconnected = false;
  const isPreview = req.isPreview === true;
  req.on('close', () => { clientDisconnected = true; });

  try {
    const { message, conversationHistory = [], sourceIa } = req.body;
    const firebaseUid = req.uid;

    if (!firebaseUid) return res.status(401).json({ error: 'Authentification échouée - UID manquant' });
    const prisma = prismaService.getInstance();
    const kine = await prisma.kine.findUnique({ where: { uid: firebaseUid } });
    if (!kine) return res.status(404).json({ error: 'Kiné non trouvé' });
    if (!message?.trim()) return res.status(400).json({ error: 'Message requis' });
    if (!sourceIa || !['biblio', 'clinique'].includes(sourceIa)) {
      return res.status(400).json({ error: 'sourceIa requis (biblio ou clinique)' });
    }

    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
    headersSent = true;

    let charCount = 0;
    let previewEnded = false;
    const charLimit = PREVIEW_CHAR_LIMITS[sourceIa] || 400;

    const result = await generateFollowupResponseStream(message, conversationHistory, kine.id, sourceIa, (delta) => {
      if (clientDisconnected || previewEnded) return;
      if (isPreview) {
        charCount += delta.length;
        if (charCount >= charLimit) {
          const remaining = charLimit - (charCount - delta.length);
          if (remaining > 0) res.write(`event: token\ndata: ${JSON.stringify({ content: delta.substring(0, remaining) })}\n\n`);
          res.write(`event: preview_end\ndata: ${JSON.stringify({ message: 'Abonnement requis pour la réponse complète', charLimit })}\n\n`);
          previewEnded = true;
          return;
        }
      }
      res.write(`event: token\ndata: ${JSON.stringify({ content: delta })}\n\n`);
    }, { skipSave: isPreview });

    if (!clientDisconnected && !previewEnded) {
      result.metadata.firebaseUid = firebaseUid;
      res.write(`event: done\ndata: ${JSON.stringify(result)}\n\n`);
    }
    if (!clientDisconnected) res.end();
  } catch (error) {
    logger.error('❌ Erreur sendIaFollowupStream:', error);
    if (!headersSent) {
      return res.status(500).json(error.success === false ? error : { success: false, error: 'Erreur followup', details: error.message });
    }
    if (!clientDisconnected) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: process.env.NODE_ENV === 'development' ? error.message : 'Erreur interne' })}\n\n`);
      res.end();
    }
  }
};

// ========== FOLLOWUP (RAG CONDITIONNEL via shouldUseRAG) ==========
const sendIaFollowup = async (req, res) => {
  try {
    const { message, conversationHistory = [], sourceIa } = req.body;
    const firebaseUid = req.uid;
    const isPreview = req.isPreview === true;

    if (!firebaseUid) {
      return res.status(401).json({
        error: 'Authentification échouée - UID manquant'
      });
    }

    const prisma = prismaService.getInstance();
    const kine = await prisma.kine.findUnique({
      where: { uid: firebaseUid }
    });

    if (!kine) {
      return res.status(404).json({ error: 'Kiné non trouvé' });
    }

    if (!message?.trim()) {
      return res.status(400).json({ error: 'Message requis' });
    }

    if (!sourceIa || !['biblio', 'clinique'].includes(sourceIa)) {
      return res.status(400).json({ error: 'sourceIa requis (biblio ou clinique)' });
    }

    const response = await generateFollowupResponse(message, conversationHistory, kine.id, sourceIa, { skipSave: isPreview });
    response.metadata.firebaseUid = firebaseUid;

    if (isPreview) {
      const charLimit = PREVIEW_CHAR_LIMITS[sourceIa] || 400;
      response.message = response.message.substring(0, charLimit);
      response.preview = true;
    }

    res.json(response);

  } catch (error) {
    logger.error('❌ Erreur sendIaFollowup:', error);

    const errorResponse = error.success === false ? error : {
      success: false,
      error: 'Erreur lors de la génération de la réponse de suivi',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    };

    res.status(500).json(errorResponse);
  }
};

// ========== HISTORIQUES ==========
const getHistoryBasique = async (req, res) => {
  try {
    const firebaseUid = req.uid;
    
    if (!firebaseUid) {
      return res.status(401).json({ 
        error: 'Authentification échouée - UID manquant' 
      });
    }

    const prisma = prismaService.getInstance();
    
    const kine = await prisma.kine.findUnique({
      where: { uid: firebaseUid }
    });
    
    if (!kine) {
      return res.status(404).json({ 
        error: 'Kiné non trouvé' 
      });
    }
    
    const kineId = kine.id;
    const days = Math.min(parseInt(req.query.days) || 5, 90);

      const history = await getHistoryFromTable('chatIaBasique', kineId, days);
    
    res.json({ 
      success: true, 
      iaType: 'basique',
      history: history 
    });
  } catch (error) {
    logger.error('Erreur getHistoryBasique:', error.message);
    res.status(500).json({ 
      error: 'Erreur serveur',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined 
    });
  }
};

const getHistoryBiblio = async (req, res) => {
  try {
    const firebaseUid = req.uid;
    
    if (!firebaseUid) {
      return res.status(401).json({ 
        error: 'Authentification échouée - UID manquant' 
      });
    }

    const prisma = prismaService.getInstance();
    
    const kine = await prisma.kine.findUnique({
      where: { uid: firebaseUid }
    });
    
    if (!kine) {
      return res.status(404).json({ 
        error: 'Kiné non trouvé' 
      });
    }
    
    const kineId = kine.id;
    const days = Math.min(parseInt(req.query.days) || 5, 90);

    const history = await getHistoryFromTable('chatIaBiblio', kineId, days);
    
    res.json({ 
      success: true, 
      iaType: 'bibliographique',
      history: history 
    });
  } catch (error) {
    logger.error('Erreur getHistoryBiblio:', error.message);
    res.status(500).json({ 
      error: 'Erreur serveur',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined 
    });
  }
};

const getHistoryClinique = async (req, res) => {
  try {
    const firebaseUid = req.uid;
    
    if (!firebaseUid) {
      return res.status(401).json({ 
        error: 'Authentification échouée - UID manquant' 
      });
    }

    const prisma = prismaService.getInstance();
    
    const kine = await prisma.kine.findUnique({
      where: { uid: firebaseUid }
    });
    
    if (!kine) {
      return res.status(404).json({ 
        error: 'Kiné non trouvé' 
      });
    }
    
    const kineId = kine.id;
    const days = Math.min(parseInt(req.query.days) || 5, 90);

    const history = await getHistoryFromTable('chatIaClinique', kineId, days);
    
    res.json({ 
      success: true, 
      iaType: 'clinique',
      history: history 
    });
  } catch (error) {
    logger.error('Erreur getHistoryClinique:', error.message);
    res.status(500).json({ 
      error: 'Erreur serveur',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined 
    });
  }
};

const getHistoryAdministrative = async (req, res) => {
  try {
    const firebaseUid = req.uid;
    
    if (!firebaseUid) {
      return res.status(401).json({ 
        error: 'Authentification échouée - UID manquant' 
      });
    }

    const prisma = prismaService.getInstance();
    
    const kine = await prisma.kine.findUnique({
      where: { uid: firebaseUid }
    });
    
    if (!kine) {
      return res.status(404).json({ 
        error: 'Kiné non trouvé' 
      });
    }
    
    const kineId = kine.id;
    const days = Math.min(parseInt(req.query.days) || 5, 90);

    const history = await getHistoryFromTable('chatIaAdministrative', kineId, days);
    
    res.json({ 
      success: true, 
      iaType: 'administrative',
      history: history 
    });
  } catch (error) {
    logger.error('Erreur getHistoryAdministrative:', error.message);
    res.status(500).json({ 
      error: 'Erreur serveur',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined 
    });
  }
};

// ========== CLEAR HISTORY ==========
const clearHistoryBasique = async (req, res) => {
  try {
    const firebaseUid = req.uid;
    
    if (!firebaseUid) {
      return res.status(401).json({ 
        error: 'Authentification échouée - UID manquant' 
      });
    }

    const prisma = prismaService.getInstance();
    
    const kine = await prisma.kine.findUnique({
      where: { uid: firebaseUid }
    });
    
    if (!kine) {
      return res.status(404).json({ 
        error: 'Kiné non trouvé' 
      });
    }
    
    const kineId = kine.id;

    await clearHistoryFromTable('chatIaBasique', kineId);
    
    res.json({ 
      success: true, 
      iaType: 'basique',
      message: 'Historique IA Basique supprimé' 
    });
  } catch (error) {
    logger.error('Erreur clearHistoryBasique:', error.message);
    res.status(500).json({ 
      error: 'Erreur serveur',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined 
    });
  }
};

const clearHistoryBiblio = async (req, res) => {
  try {
    const firebaseUid = req.uid;
    
    if (!firebaseUid) {
      return res.status(401).json({ 
        error: 'Authentification échouée - UID manquant' 
      });
    }

    const prisma = prismaService.getInstance();
    
    const kine = await prisma.kine.findUnique({
      where: { uid: firebaseUid }
    });
    
    if (!kine) {
      return res.status(404).json({ 
        error: 'Kiné non trouvé' 
      });
    }
    
    const kineId = kine.id;

    await clearHistoryFromTable('chatIaBiblio', kineId);
    
    res.json({ 
      success: true, 
      iaType: 'bibliographique',
      message: 'Historique IA Bibliographique supprimé' 
    });
  } catch (error) {
    logger.error('Erreur clearHistoryBiblio:', error.message);
    res.status(500).json({ 
      error: 'Erreur serveur',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined 
    });
  }
};

const clearHistoryClinique = async (req, res) => {
  try {
    const firebaseUid = req.uid;
    
    if (!firebaseUid) {
      return res.status(401).json({ 
        error: 'Authentification échouée - UID manquant' 
      });
    }

    const prisma = prismaService.getInstance();
    
    const kine = await prisma.kine.findUnique({
      where: { uid: firebaseUid }
    });
    
    if (!kine) {
      return res.status(404).json({ 
        error: 'Kiné non trouvé' 
      });
    }
    
    const kineId = kine.id;

    await clearHistoryFromTable('chatIaClinique', kineId);
    
    res.json({ 
      success: true, 
      iaType: 'clinique',
      message: 'Historique IA Clinique supprimé' 
    });
  } catch (error) {
    logger.error('Erreur clearHistoryClinique:', error.message);
    res.status(500).json({ 
      error: 'Erreur serveur',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined 
    });
  }
};

const clearHistoryAdministrative = async (req, res) => {
  try {
    const firebaseUid = req.uid;
    
    if (!firebaseUid) {
      return res.status(401).json({ 
        error: 'Authentification échouée - UID manquant' 
      });
    }

    const prisma = prismaService.getInstance();
    
    const kine = await prisma.kine.findUnique({
      where: { uid: firebaseUid }
    });
    
    if (!kine) {
      return res.status(404).json({ 
        error: 'Kiné non trouvé' 
      });
    }
    
    const kineId = kine.id;

    await clearHistoryFromTable('chatIaAdministrative', kineId);
    
    res.json({ 
      success: true, 
      iaType: 'administrative',
      message: 'Historique IA Administrative supprimé' 
    });
  } catch (error) {
    logger.error('Erreur clearHistoryAdministrative:', error.message);
    res.status(500).json({ 
      error: 'Erreur serveur',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined 
    });
  }
};

// ========== FONCTIONS HELPER ==========
const getHistoryFromTable = async (tableName, kineId, days) => {
  const prisma = prismaService.getInstance();
  const daysAgo = new Date();
  daysAgo.setDate(daysAgo.getDate() - days);

  return await prisma[tableName].findMany({
    where: {
      kineId: kineId,
      createdAt: {
        gte: daysAgo
      }
    },
    orderBy: {
      createdAt: 'desc'
    },
    take: 50
  });
};

const clearHistoryFromTable = async (tableName, kineId) => {
  const prisma = prismaService.getInstance();
  
  await prisma[tableName].deleteMany({
    where: {
      kineId: kineId
    }
  });
};

// ========== EXPORTS ==========
module.exports = {
  sendIaBasique,
  sendIaBasiqueStream,
  sendIaBiblio,
  sendIaBiblioStream,
  sendIaClinique,
  sendIaCliniqueStream,
  sendIaAdministrative,
  sendIaFollowup,
  sendIaFollowupStream,
  getHistoryBasique,
  getHistoryBiblio,
  getHistoryClinique,
  getHistoryAdministrative,
  clearHistoryBasique,
  clearHistoryBiblio,
  clearHistoryClinique,
  clearHistoryAdministrative
};