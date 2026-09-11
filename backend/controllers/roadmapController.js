// controllers/roadmapController.js — Roadmap : lecture kiné, envoi d'idée, gestion admin
const roadmapService = require('../services/roadmapService');
const { ROADMAP_IDEE_STATUTS } = require('../middleware/validate');
const logger = require('../utils/logger');

/** Renvoie la réponse d'erreur : 404 métier (RoadmapError) ou 500 avec le code fourni. */
function sendError(res, error, fallbackCode, fallbackMessage) {
  if (error instanceof roadmapService.RoadmapError) {
    return res.status(error.status).json({ success: false, error: error.message, code: error.code });
  }
  logger.error(`Erreur roadmap (${fallbackCode}):`, error);
  return res.status(500).json({ success: false, error: fallbackMessage, code: fallbackCode });
}

function parseId(req, res) {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id) || id <= 0) {
    res.status(400).json({ success: false, error: 'ID invalide', code: 'INVALID_ID' });
    return null;
  }
  return id;
}

const publicIdee = (idee) => ({
  id: idee.id,
  titre: idee.titre,
  description: idee.description,
  statut: idee.statut,
  itemId: idee.itemId ?? null,
  createdAt: idee.createdAt,
});

// ===================== KINÉ =====================

async function getRoadmap(req, res) {
  try {
    const groups = await roadmapService.getRoadmapForKine();
    res.json({ success: true, ...groups });
  } catch (error) {
    sendError(res, error, 'ROADMAP_FETCH_ERROR', 'Erreur lors du chargement de la roadmap');
  }
}

async function createIdee(req, res) {
  try {
    const { titre, description, itemId } = req.body; // déjà validé et trimé par validate(roadmapIdeeSchema)
    const idee = await roadmapService.createIdee(req.uid, { titre, description, itemId });
    res.status(201).json({ success: true, idee: publicIdee(idee) });
  } catch (error) {
    sendError(res, error, 'ROADMAP_IDEE_CREATE_ERROR', "Erreur lors de l'envoi de l'idée");
  }
}

// ===================== ADMIN — CARDS =====================

async function adminListItems(req, res) {
  try {
    const items = await roadmapService.listAllItems();
    res.json({ success: true, items });
  } catch (error) {
    sendError(res, error, 'ROADMAP_ADMIN_ERROR', 'Erreur lors de la récupération des cards');
  }
}

async function adminCreateItem(req, res) {
  try {
    const item = await roadmapService.createItem(req.body);
    res.status(201).json({ success: true, item });
  } catch (error) {
    sendError(res, error, 'ROADMAP_ADMIN_ERROR', 'Erreur lors de la création de la card');
  }
}

async function adminUpdateItem(req, res) {
  const id = parseId(req, res);
  if (id === null) return;
  try {
    const item = await roadmapService.updateItem(id, req.body);
    res.json({ success: true, item });
  } catch (error) {
    sendError(res, error, 'ROADMAP_ADMIN_ERROR', 'Erreur lors de la modification de la card');
  }
}

async function adminDeleteItem(req, res) {
  const id = parseId(req, res);
  if (id === null) return;
  try {
    await roadmapService.deleteItem(id);
    res.json({ success: true });
  } catch (error) {
    sendError(res, error, 'ROADMAP_ADMIN_ERROR', 'Erreur lors de la suppression de la card');
  }
}

// ===================== ADMIN — IDÉES =====================

async function adminListIdees(req, res) {
  const { statut } = req.query;
  if (statut !== undefined && !ROADMAP_IDEE_STATUTS.includes(statut)) {
    return res.status(400).json({ success: false, error: 'Statut inconnu', code: 'VALIDATION_ERROR' });
  }
  let itemId;
  if (req.query.itemId !== undefined) {
    itemId = parseInt(req.query.itemId, 10);
    if (Number.isNaN(itemId) || itemId <= 0 || String(itemId) !== String(req.query.itemId)) {
      return res.status(400).json({ success: false, error: 'itemId invalide', code: 'VALIDATION_ERROR' });
    }
  }
  try {
    const idees = await roadmapService.listIdees({ statut, itemId });
    res.json({ success: true, idees });
  } catch (error) {
    sendError(res, error, 'ROADMAP_ADMIN_ERROR', 'Erreur lors de la récupération des idées');
  }
}

async function adminSetIdeeStatut(req, res) {
  const id = parseId(req, res);
  if (id === null) return;
  try {
    const idee = await roadmapService.setIdeeStatut(id, req.body.statut);
    res.json({ success: true, idee });
  } catch (error) {
    sendError(res, error, 'ROADMAP_ADMIN_ERROR', "Erreur lors du changement de statut de l'idée");
  }
}

module.exports = {
  getRoadmap,
  createIdee,
  adminListItems,
  adminCreateItem,
  adminUpdateItem,
  adminDeleteItem,
  adminListIdees,
  adminSetIdeeStatut,
};
