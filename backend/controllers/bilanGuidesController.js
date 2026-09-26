// controllers/bilanGuidesController.js — Fiches pratiques des tests : lecture kiné, liste et édition admin
const bilanGuideService = require('../services/bilanGuideService');
const logger = require('../utils/logger');

// Clés du catalogue : snake_case (cf. BilanCanonicalField.key)
const KEY_RE = /^[a-z0-9_]{1,80}$/;

function sendError(res, error, fallbackCode, fallbackMessage) {
  if (error instanceof bilanGuideService.BilanGuideError) {
    return res.status(error.status).json({ success: false, error: error.message, code: error.code });
  }
  logger.error(`Erreur fiche test (${fallbackCode}):`, error);
  return res.status(500).json({ success: false, error: fallbackMessage, code: fallbackCode });
}

function parseKey(req, res) {
  const { key } = req.params;
  if (!KEY_RE.test(key)) {
    res.status(400).json({ success: false, error: 'Clé de test invalide', code: 'INVALID_KEY' });
    return null;
  }
  return key;
}

async function getGuide(req, res) {
  const key = parseKey(req, res);
  if (!key) return;
  try {
    const guide = await bilanGuideService.getGuide(key);
    res.json({ success: true, guide });
  } catch (error) {
    sendError(res, error, 'BILAN_GUIDE_FETCH_ERROR', 'Erreur lors du chargement de la fiche');
  }
}

async function adminList(req, res) {
  try {
    const fields = await bilanGuideService.listForAdmin();
    res.json({ success: true, fields });
  } catch (error) {
    sendError(res, error, 'BILAN_GUIDES_FETCH_ERROR', 'Erreur lors du chargement des fiches');
  }
}

async function adminUpsert(req, res) {
  const key = parseKey(req, res);
  if (!key) return;
  try {
    const { content, videoUrl } = req.body; // déjà validé et trimé par validate(bilanGuideSchema)
    const guide = await bilanGuideService.upsertGuide(key, { content, videoUrl }, req.userEmail);
    logger.info(`Fiche test enregistrée : ${key} (${content.length} car., vidéo ${guide.youtubeId ? 'oui' : 'non'})`);
    res.json({ success: true, guide });
  } catch (error) {
    sendError(res, error, 'BILAN_GUIDE_SAVE_ERROR', "Erreur lors de l'enregistrement de la fiche");
  }
}

module.exports = { getGuide, adminList, adminUpsert };
