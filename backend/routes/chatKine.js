const express = require('express');
const router = express.Router();
const chatKineController = require('../controllers/chatKineController');
const authMiddleware = require('../middleware/authenticate');

// Si votre middleware exporte un objet, extraire la fonction
const authenticate = authMiddleware.authenticate || authMiddleware;

// Vérification de sécurité
if (typeof authenticate !== 'function') {
  console.error('❌ ERREUR: authenticate n\'est pas une fonction');
  console.log('Type:', typeof authenticate);
  console.log('Contenu:', authenticate);
  throw new Error('Middleware authenticate invalide');
}

console.log('✅ Middleware authenticate est une fonction');

// Routes pour le chat kiné
router.post('/message', authenticate, chatKineController.sendMessage);
router.get('/history', authenticate, chatKineController.getHistory);
router.delete('/history', authenticate, chatKineController.clearHistory);

module.exports = router;