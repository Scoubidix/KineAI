const express = require('express');
const logger = require('../utils/logger');
const router = express.Router();

const { authenticate } = require('../middleware/authenticate');
const { 
  createKine, 
  getKineProfile, 
  updateKineProfile,
  getAdherenceByDate,        // NOUVELLE FONCTION
  getPatientSessionsByDate   // NOUVELLE FONCTION
} = require('../controllers/kineController');

// POST /kine - Créer un nouveau kiné (lors de l'inscription)
router.post('/', createKine);

// GET /kine/profile - Récupérer le profil du kiné connecté (nécessite auth)
router.get('/profile', authenticate, getKineProfile);

// PUT /kine/profile - Modifier le profil du kiné connecté (nécessite auth)
router.put('/profile', authenticate, updateKineProfile);

// ==========================================
// NOUVELLES ROUTES POUR LE SUIVI D'ADHÉRENCE
// ==========================================

// GET /kine/adherence/:date - Calculer l'adhérence globale pour une date donnée
// Exemple: GET /kine/adherence/2025-07-02
router.get('/adherence/:date', authenticate, getAdherenceByDate);

// GET /kine/patients-sessions/:date - Liste détaillée des patients et leur statut de validation
// Exemple: GET /kine/patients-sessions/2025-07-02
router.get('/patients-sessions/:date', authenticate, getPatientSessionsByDate);

module.exports = router;