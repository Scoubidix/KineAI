const express = require('express');
const router = express.Router();

const { authenticate } = require('../middleware/authenticate');
const { createKine, getKineProfile, updateKineProfile } = require('../controllers/kineController');

// POST /kine - Créer un nouveau kiné (lors de l'inscription)
router.post('/', createKine);

// GET /kine/profile - Récupérer le profil du kiné connecté (nécessite auth)
router.get('/profile', authenticate, getKineProfile);

// PUT /kine/profile - Modifier le profil du kiné connecté (nécessite auth)
router.put('/profile', authenticate, updateKineProfile);

module.exports = router;