// routes/adminRoadmap.js — Gestion de la roadmap (admin uniquement) : cards + idées reçues
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authenticate');
const { requireAdmin } = require('../middleware/authorization');
const { validate, roadmapItemSchema, roadmapIdeeStatutSchema } = require('../middleware/validate');
const roadmapController = require('../controllers/roadmapController');

// Cards (actives et inactives)
router.get('/items', authenticate, requireAdmin, roadmapController.adminListItems);
router.post('/items', authenticate, requireAdmin, validate(roadmapItemSchema), roadmapController.adminCreateItem);
router.put('/items/:id', authenticate, requireAdmin, validate(roadmapItemSchema), roadmapController.adminUpdateItem);
router.delete('/items/:id', authenticate, requireAdmin, roadmapController.adminDeleteItem);

// Idées reçues des kinés
router.get('/idees', authenticate, requireAdmin, roadmapController.adminListIdees);
router.patch('/idees/:id/statut', authenticate, requireAdmin, validate(roadmapIdeeStatutSchema), roadmapController.adminSetIdeeStatut);

module.exports = router;
