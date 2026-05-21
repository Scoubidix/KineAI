const prismaService = require('./prismaService');
const logger = require('../utils/logger');
const { sanitizeId } = require('../utils/logSanitizer');

/**
 * Service de gestion des contacts kinés (carnet d'adresses pour contrats).
 * Léger : firstName, lastName, email, phone, notes. Pas de PII sensible.
 */

async function getAllContactsKine(kineId) {
  const prisma = prismaService.getInstance();
  return prisma.contactKine.findMany({
    where: { kineId },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }]
  });
}

async function getContactKineById(contactKineId, kineId) {
  const prisma = prismaService.getInstance();
  const contact = await prisma.contactKine.findFirst({
    where: { id: contactKineId, kineId }
  });
  return contact || null;
}

async function createContactKine({ kineId, firstName, lastName, email, phone, notes }) {
  const prisma = prismaService.getInstance();

  // Détection doublon (kineId + email)
  const existing = await prisma.contactKine.findFirst({
    where: { kineId, email }
  });
  if (existing) {
    const err = new Error('Un contact avec cet email existe déjà');
    err.code = 'DUPLICATE_CONTACT';
    throw err;
  }

  const contact = await prisma.contactKine.create({
    data: { kineId, firstName, lastName, email, phone: phone || null, notes: notes || null }
  });

  logger.info(`ContactKine créé : kiné ${sanitizeId(kineId)} → contact ${sanitizeId(contact.id)}`);
  return contact;
}

async function updateContactKine(contactKineId, kineId, data) {
  const prisma = prismaService.getInstance();
  const existing = await prisma.contactKine.findFirst({
    where: { id: contactKineId, kineId }
  });
  if (!existing) {
    const err = new Error('Contact introuvable');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const { firstName, lastName, email, phone, notes } = data;

  // Si email modifié, vérifier doublon
  if (email && email !== existing.email) {
    const dup = await prisma.contactKine.findFirst({
      where: { kineId, email, id: { not: contactKineId } }
    });
    if (dup) {
      const err = new Error('Un contact avec cet email existe déjà');
      err.code = 'DUPLICATE_CONTACT';
      throw err;
    }
  }

  return prisma.contactKine.update({
    where: { id: contactKineId },
    data: {
      firstName: firstName ?? existing.firstName,
      lastName: lastName ?? existing.lastName,
      email: email ?? existing.email,
      phone: phone !== undefined ? phone : existing.phone,
      notes: notes !== undefined ? notes : existing.notes,
    }
  });
}

async function deleteContactKine(contactKineId, kineId) {
  const prisma = prismaService.getInstance();
  const existing = await prisma.contactKine.findFirst({
    where: { id: contactKineId, kineId }
  });
  if (!existing) {
    const err = new Error('Contact introuvable');
    err.code = 'NOT_FOUND';
    throw err;
  }

  await prisma.contactKine.delete({ where: { id: contactKineId } });
  logger.info(`ContactKine supprimé : ${sanitizeId(contactKineId)} (kiné ${sanitizeId(kineId)})`);
}

module.exports = {
  getAllContactsKine,
  getContactKineById,
  createContactKine,
  updateContactKine,
  deleteContactKine,
};
