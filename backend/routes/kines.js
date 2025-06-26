const express = require('express');
const router = express.Router();

const { authenticate } = require('../middleware/authenticate');
const { createKine, getKineProfile } = require('../controllers/kineController');

// POST /kine - Créer un nouveau kiné (lors de l'inscription)
router.post('/', createKine);

// GET /kine/profile - Récupérer le profil du kiné connecté (nécessite auth)
router.get('/profile', authenticate, getKineProfile);

module.exports = router;