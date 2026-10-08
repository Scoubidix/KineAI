// controllers/patientNotesController.js — Notes rapides du dossier patient
const patientNoteService = require('../services/patientNoteService');
const logger = require('../utils/logger');

/**
 * Renvoie la réponse d'erreur : 4xx métier (PatientNoteError) ou 500.
 * Jamais error.message dans les logs : une erreur Prisma peut citer le contenu de la note.
 */
function sendError(res, error, action) {
  if (error instanceof patientNoteService.PatientNoteError) {
    return res.status(error.status).json({ success: false, error: error.message, code: error.code });
  }
  logger.error(`Erreur notes patient (${action}): ${error.name}${error.code ? ` ${error.code}` : ''}`);
  return res.status(500).json({ success: false, error: 'Erreur lors du traitement de la note', code: 'PATIENT_NOTES_ERROR' });
}

/** Paramètre d'URL entier strictement positif ; sinon répond 400 et renvoie null. */
function parseIdParam(req, res, name) {
  const raw = req.params[name];
  const id = /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(id) || id <= 0) {
    res.status(400).json({ success: false, error: 'ID invalide', code: 'INVALID_ID' });
    return null;
  }
  return id;
}

async function listNotes(req, res) {
  const patientId = parseIdParam(req, res, 'id');
  if (patientId === null) return;
  try {
    const notes = await patientNoteService.listNotes(req.uid, patientId);
    res.json({ success: true, notes });
  } catch (error) {
    sendError(res, error, 'list');
  }
}

async function createNote(req, res) {
  const patientId = parseIdParam(req, res, 'id');
  if (patientId === null) return;
  try {
    // content déjà validé et trimé par validate(patientNoteSchema)
    const note = await patientNoteService.createNote(req.uid, patientId, req.body.content);
    res.status(201).json({ success: true, note });
  } catch (error) {
    sendError(res, error, 'create');
  }
}

async function updateNote(req, res) {
  const patientId = parseIdParam(req, res, 'id');
  if (patientId === null) return;
  const noteId = parseIdParam(req, res, 'noteId');
  if (noteId === null) return;
  try {
    const note = await patientNoteService.updateNote(req.uid, patientId, noteId, req.body.content);
    res.json({ success: true, note });
  } catch (error) {
    sendError(res, error, 'update');
  }
}

async function deleteNote(req, res) {
  const patientId = parseIdParam(req, res, 'id');
  if (patientId === null) return;
  const noteId = parseIdParam(req, res, 'noteId');
  if (noteId === null) return;
  try {
    await patientNoteService.deleteNote(req.uid, patientId, noteId);
    res.json({ success: true });
  } catch (error) {
    sendError(res, error, 'delete');
  }
}

module.exports = { listNotes, createNote, updateNote, deleteNote };
