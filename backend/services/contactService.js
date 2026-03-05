const prismaService = require('./prismaService');
const logger = require('../utils/logger');

/**
 * Service de gestion des contacts (médecins, mutuelles, etc.)
 */

async function getAllContacts(kineId) {
  const prisma = prismaService.getInstance();
  return prisma.contact.findMany({
    where: { kineId },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }]
  });
}

async function getContactById(contactId, kineId) {
  const prisma = prismaService.getInstance();
  const contact = await prisma.contact.findUnique({
    where: { id: contactId }
  });
  if (!contact || contact.kineId !== kineId) {
    return null;
  }
  return contact;
}

async function createContact({ kineId, firstName, lastName, email, phone, type }) {
  if (!firstName && !lastName) {
    throw new Error('Au moins un nom ou prénom est requis');
  }

  const prisma = prismaService.getInstance();
  const contact = await prisma.contact.create({
    data: { kineId, firstName, lastName, email, phone, type }
  });

  logger.info(`Contact créé: ${firstName} ${lastName} (kiné ${kineId})`);
  return contact;
}

async function updateContact(contactId, kineId, data) {
  const prisma = prismaService.getInstance();
  const existing = await prisma.contact.findUnique({ where: { id: contactId } });

  if (!existing || existing.kineId !== kineId) {
    throw new Error('Contact introuvable ou accès refusé');
  }

  const { firstName, lastName, email, phone, type } = data;
  return prisma.contact.update({
    where: { id: contactId },
    data: { firstName, lastName, email, phone, type }
  });
}

async function deleteContact(contactId, kineId) {
  const prisma = prismaService.getInstance();
  const existing = await prisma.contact.findUnique({ where: { id: contactId } });

  if (!existing || existing.kineId !== kineId) {
    throw new Error('Contact introuvable ou accès refusé');
  }

  await prisma.contact.delete({ where: { id: contactId } });
  logger.info(`Contact supprimé: ${contactId} (kiné ${kineId})`);
}

module.exports = {
  getAllContacts,
  getContactById,
  createContact,
  updateContact,
  deleteContact
};
