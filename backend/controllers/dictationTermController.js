// controllers/dictationTermController.js — vocabulaire signalé, côté admin
const logger = require('../utils/logger');
const dictationTermService = require('../services/dictationTermService');

/** GET /api/admin/dictation-terms?statut= */
exports.adminList = async (req, res) => {
  try {
    const { statut } = req.query;
    if (statut && !dictationTermService.STATUTS.includes(statut)) {
      return res.status(400).json({ success: false, error: 'Statut invalide', code: 'VALIDATION_ERROR' });
    }
    const terms = await dictationTermService.adminList({ statut });
    return res.json({ success: true, terms });
  } catch (err) {
    logger.error(`Vocabulaire signalé : liste admin en échec (${err?.message})`);
    return res.status(500).json({ success: false, error: 'Lecture impossible', code: 'INTERNAL_ERROR' });
  }
};

/** PATCH /api/admin/dictation-terms/:id/statut */
exports.adminSetStatut = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ success: false, error: 'ID invalide', code: 'VALIDATION_ERROR' });
    const term = await dictationTermService.adminSetStatut({ id, statut: req.body.statut });
    return res.json({ success: true, term });
  } catch (err) {
    if (err?.code === 'P2025') return res.status(404).json({ success: false, error: 'Terme introuvable', code: 'TERM_NOT_FOUND' });
    logger.error(`Vocabulaire signalé : changement de statut en échec (${err?.message})`);
    return res.status(500).json({ success: false, error: 'Écriture impossible', code: 'INTERNAL_ERROR' });
  }
};
