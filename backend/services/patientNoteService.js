// services/patientNoteService.js — Notes rapides du kiné sur le dossier d'un patient
const prismaService = require('./prismaService');

/** Erreur métier portée jusqu'au controller (code API + statut HTTP). */
class PatientNoteError extends Error {
  constructor(code, status = 400, message = code) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

// Champs exposés au front : rien d'interne (kineId, isActive, deletedAt restent en base)
const NOTE_SELECT = { id: true, content: true, createdAt: true, updatedAt: true };

/**
 * Le kiné est résolu par son uid Firebase ; le patient doit lui appartenir et être actif.
 * Un patient d'un autre kiné et un patient inexistant donnent la même 404 (pas de fuite d'existence).
 */
async function resolveOwnedPatient(prisma, uid, patientId) {
  const kine = await prisma.kine.findUnique({ where: { uid }, select: { id: true } });
  if (!kine) throw new PatientNoteError('KINE_NOT_FOUND', 404, 'Kiné non trouvé');
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, kineId: kine.id, isActive: true },
    select: { id: true },
  });
  if (!patient) throw new PatientNoteError('PATIENT_NOT_FOUND', 404, 'Patient non trouvé');
  return kine.id;
}

/** La note doit être active et appartenir à ce patient ET à ce kiné. */
async function assertOwnedNote(prisma, kineId, patientId, noteId) {
  const note = await prisma.patientNote.findFirst({
    where: { id: noteId, patientId, kineId, isActive: true },
    select: { id: true },
  });
  if (!note) throw new PatientNoteError('NOTE_NOT_FOUND', 404, 'Note non trouvée');
}

async function listNotes(uid, patientId) {
  const prisma = prismaService.getInstance();
  const kineId = await resolveOwnedPatient(prisma, uid, patientId);
  return prisma.patientNote.findMany({
    where: { patientId, kineId, isActive: true },
    select: NOTE_SELECT,
    orderBy: { createdAt: 'desc' },
  });
}

async function createNote(uid, patientId, content) {
  const prisma = prismaService.getInstance();
  const kineId = await resolveOwnedPatient(prisma, uid, patientId);
  return prisma.patientNote.create({
    data: { content, patientId, kineId },
    select: NOTE_SELECT,
  });
}

async function updateNote(uid, patientId, noteId, content) {
  const prisma = prismaService.getInstance();
  const kineId = await resolveOwnedPatient(prisma, uid, patientId);
  await assertOwnedNote(prisma, kineId, patientId, noteId);
  return prisma.patientNote.update({
    where: { id: noteId },
    data: { content },
    select: NOTE_SELECT,
  });
}

async function deleteNote(uid, patientId, noteId) {
  const prisma = prismaService.getInstance();
  const kineId = await resolveOwnedPatient(prisma, uid, patientId);
  await assertOwnedNote(prisma, kineId, patientId, noteId);
  await prisma.patientNote.update({
    where: { id: noteId },
    data: { isActive: false, deletedAt: new Date() },
  });
}

module.exports = { PatientNoteError, listNotes, createNote, updateNote, deleteNote };
