const prismaService = require('./prismaService');
const logger = require('../utils/logger');

/**
 * Service de gestion des templates administratifs
 * Gère la personnalisation, l'auto-fill et l'historique des envois
 */

// ========== CONFIGURATION AUTO-FILL ==========

/**
 * Variables reconnues pour auto-remplissage
 * Format: '[Variable]' -> fonction d'extraction
 */
const AUTO_FILL_VARIABLES = {
  // PATIENT
  '[Nom Patient]': (data) => data.patient?.lastName || '[Nom Patient]',
  '[Prénom Patient]': (data) => data.patient?.firstName || '[Prénom Patient]',
  '[Nom du patient]': (data) => {
    const firstName = data.patient?.firstName || '';
    const lastName = data.patient?.lastName || '';
    return firstName && lastName ? `${firstName} ${lastName.toUpperCase()}` : '[Nom du patient]';
  },
  '[M./Mme Nom du patient]': (data) => {
    const firstName = data.patient?.firstName || '';
    const lastName = data.patient?.lastName || '';
    return firstName && lastName ? `M./Mme ${firstName} ${lastName.toUpperCase()}` : '[M./Mme Nom du patient]';
  },

  // KINÉ
  '[Nom Kiné]': (data) => data.kine?.lastName || '[Nom Kiné]',
  '[Prénom Kiné]': (data) => data.kine?.firstName || '[Prénom Kiné]',
  '[Votre Nom]': (data) => {
    const firstName = data.kine?.firstName || '';
    const lastName = data.kine?.lastName || '';
    return firstName && lastName ? `${firstName} ${lastName}` : '[Votre Nom]';
  },
};

// ========== FONCTIONS UTILITAIRES ==========

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractVariables(text) {
  const regex = /\[([^\]]+)\]/g;
  const variables = new Set();
  let match;

  while ((match = regex.exec(text)) !== null) {
    variables.add(match[0]);
  }

  return Array.from(variables);
}

function replaceVariable(text, variable, value) {
  const regex = new RegExp(escapeRegex(variable), 'g');
  return text.replace(regex, value);
}

// ========== FONCTIONS PRINCIPALES ==========

/**
 * Personnalise un template avec les données patient/contact/kiné
 */
async function personalizeTemplate({ templateId, patientId, contactId, kineId }) {
  try {
    const prisma = prismaService.getInstance();

    const template = await prisma.adminTemplate.findUnique({
      where: { id: templateId }
    });

    if (!template) {
      throw new Error(`Template ${templateId} introuvable`);
    }

    // Récupérer patient OU contact
    let patient = null;
    let contact = null;

    if (patientId) {
      patient = await prisma.patient.findUnique({
        where: { id: patientId },
        select: {
          id: true, firstName: true, lastName: true,
          email: true, phone: true,
          emailConsent: true, whatsappConsent: true
        }
      });
      if (!patient) throw new Error(`Patient ${patientId} introuvable`);
    } else if (contactId) {
      contact = await prisma.contact.findUnique({
        where: { id: contactId }
      });
      if (!contact) throw new Error(`Contact ${contactId} introuvable`);
    }

    const kine = await prisma.kine.findUnique({
      where: { id: kineId },
      select: { id: true, firstName: true, lastName: true, email: true, adresseCabinet: true }
    });

    if (!kine) throw new Error(`Kiné ${kineId} introuvable`);

    // Auto-fill: use patient data if available, otherwise contact data for name variables
    const fillData = {
      patient: patient || (contact ? { firstName: contact.firstName, lastName: contact.lastName } : null),
      kine
    };

    let personalizedBody = template.body;
    let personalizedSubject = template.subject || '';
    const autoFilledVariables = [];

    Object.entries(AUTO_FILL_VARIABLES).forEach(([variable, extractFn]) => {
      const value = extractFn(fillData);
      if (personalizedBody.includes(variable) || personalizedSubject.includes(variable)) {
        personalizedBody = replaceVariable(personalizedBody, variable, value);
        personalizedSubject = replaceVariable(personalizedSubject, variable, value);
        autoFilledVariables.push({ variable, value, replaced: true });
      }
    });

    const remainingVariables = extractVariables(personalizedBody);

    return {
      success: true,
      template: {
        id: template.id, title: template.title,
        category: template.category,
        originalBody: template.body, originalSubject: template.subject
      },
      personalizedBody,
      personalizedSubject,
      autoFilledVariables,
      remainingVariables,
      patient: patient ? {
        id: patient.id, firstName: patient.firstName, lastName: patient.lastName,
        email: patient.email, phone: patient.phone,
        emailConsent: patient.emailConsent, whatsappConsent: patient.whatsappConsent
      } : null,
      contact: contact ? {
        id: contact.id, firstName: contact.firstName, lastName: contact.lastName,
        email: contact.email, phone: contact.phone, type: contact.type
      } : null,
      kine: { id: kine.id, firstName: kine.firstName, lastName: kine.lastName }
    };

  } catch (error) {
    logger.error('Erreur personalizeTemplate:', error.message);
    throw error;
  }
}

/**
 * Récupère tous les templates avec filtres optionnels
 * @param {Object} filters
 * @param {string} [filters.category]
 * @param {string} [filters.search]
 * @param {number} [filters.kineId] - Pour filtrer les templates privés
 * @param {string} [filters.scope] - 'public' | 'private' | 'all' (défaut 'all')
 */
async function getAllTemplates({ category, search, kineId, scope = 'all' } = {}) {
  try {
    const prisma = prismaService.getInstance();

    const where = {};

    // Filtre scope
    if (scope === 'public') {
      where.isPublic = true;
    } else if (scope === 'private' && kineId) {
      where.kineId = kineId;
      where.isPublic = false;
    } else if (scope === 'all' && kineId) {
      // All = public OR owned by this kiné
      where.OR = [
        { isPublic: true },
        { kineId: kineId }
      ];
    }

    if (category) {
      where.category = category;
    }

    if (search) {
      const searchConditions = [
        { title: { contains: search, mode: 'insensitive' } },
        { tags: { has: search.toLowerCase() } }
      ];
      if (where.OR) {
        // Combine scope OR with search OR using AND
        where.AND = [{ OR: where.OR }, { OR: searchConditions }];
        delete where.OR;
      } else {
        where.OR = searchConditions;
      }
    }

    const templates = await prisma.adminTemplate.findMany({
      where,
      orderBy: [{ category: 'asc' }, { title: 'asc' }]
    });

    return { success: true, templates, count: templates.length };

  } catch (error) {
    logger.error('Erreur getAllTemplates:', error.message);
    throw error;
  }
}

/**
 * Récupère les catégories avec compteurs
 */
async function getCategories(kineId) {
  try {
    const prisma = prismaService.getInstance();

    const where = kineId
      ? { OR: [{ isPublic: true }, { kineId }] }
      : {};

    const templates = await prisma.adminTemplate.findMany({
      where,
      select: { category: true }
    });

    const categoriesCount = {};
    templates.forEach(t => {
      categoriesCount[t.category] = (categoriesCount[t.category] || 0) + 1;
    });

    const categories = Object.entries(categoriesCount).map(([name, count]) => ({
      name, count
    }));

    return { success: true, categories };

  } catch (error) {
    logger.error('Erreur getCategories:', error.message);
    throw error;
  }
}

/**
 * Crée un template privé pour un kiné
 */
async function createTemplate({ kineId, title, category, subject, body, tags = [] }) {
  if (!title || !category || !body) {
    throw new Error('title, category et body sont requis');
  }

  const prisma = prismaService.getInstance();
  const template = await prisma.adminTemplate.create({
    data: {
      kineId,
      title,
      category,
      subject,
      body,
      tags,
      isPublic: false
    }
  });

  logger.info(`Template créé: ${title} (kiné ${kineId})`);
  return template;
}

/**
 * Met à jour un template privé (ownership check)
 */
async function updateTemplate(templateId, kineId, data) {
  const prisma = prismaService.getInstance();
  const existing = await prisma.adminTemplate.findUnique({ where: { id: templateId } });

  if (!existing) throw new Error('Template introuvable');
  if (existing.isPublic || existing.kineId !== kineId) {
    throw new Error('Modification non autorisée');
  }

  const { title, category, subject, body, tags } = data;
  return prisma.adminTemplate.update({
    where: { id: templateId },
    data: { title, category, subject, body, tags }
  });
}

/**
 * Supprime un template privé (ownership check)
 */
async function deleteTemplate(templateId, kineId) {
  const prisma = prismaService.getInstance();
  const existing = await prisma.adminTemplate.findUnique({ where: { id: templateId } });

  if (!existing) throw new Error('Template introuvable');
  if (existing.isPublic || existing.kineId !== kineId) {
    throw new Error('Suppression non autorisée');
  }

  await prisma.adminTemplate.delete({ where: { id: templateId } });
  logger.info(`Template supprimé: ${templateId} (kiné ${kineId})`);
}

/**
 * Sauvegarde un envoi dans l'historique
 */
async function saveToHistory({
  kineId,
  patientId,
  contactId,
  templateId,
  templateTitle,
  subject,
  body,
  recipientName,
  recipientEmail,
  method = 'EMAIL'
}) {
  try {
    const prisma = prismaService.getInstance();

    // Build recipient info from patient/contact if not provided
    let patientEmail = null;
    let patientPhone = null;

    if (patientId) {
      const patient = await prisma.patient.findUnique({
        where: { id: patientId },
        select: { email: true, phone: true, firstName: true, lastName: true }
      });
      if (patient) {
        patientEmail = method === 'EMAIL' ? patient.email : null;
        patientPhone = method === 'WHATSAPP' ? patient.phone : null;
        if (!recipientName) recipientName = `${patient.firstName} ${patient.lastName}`;
        if (!recipientEmail) recipientEmail = patient.email;
      }
    } else if (contactId) {
      const contact = await prisma.contact.findUnique({
        where: { id: contactId },
        select: { firstName: true, lastName: true, email: true }
      });
      if (contact) {
        if (!recipientName) recipientName = `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
        if (!recipientEmail) recipientEmail = contact.email;
      }
    }

    const history = await prisma.templateSentHistory.create({
      data: {
        kineId,
        patientId: patientId || null,
        contactId: contactId || null,
        templateId: templateId || null,
        templateTitle,
        subject,
        body,
        recipientName: recipientName || 'Inconnu',
        recipientEmail,
        patientEmail,
        patientPhone,
        method
      }
    });

    // Incrémenter compteur d'usage si template fourni
    if (templateId) {
      await prisma.adminTemplate.update({
        where: { id: templateId },
        data: { usageCount: { increment: 1 } }
      });
    }

    logger.info(`Envoi sauvegardé - Template: ${templateTitle}, Méthode: ${method}`);
    return { success: true, history };

  } catch (error) {
    logger.error('Erreur saveToHistory:', error.message);
    throw error;
  }
}

/**
 * Récupère l'historique des envois pour un kiné
 */
async function getHistory(kineId, { limit = 50, offset = 0 } = {}) {
  try {
    const prisma = prismaService.getInstance();

    const history = await prisma.templateSentHistory.findMany({
      where: { kineId },
      include: {
        patient: {
          select: { firstName: true, lastName: true }
        },
        contact: {
          select: { firstName: true, lastName: true, type: true }
        },
        template: {
          select: { title: true, category: true }
        }
      },
      orderBy: { sentAt: 'desc' },
      take: limit,
      skip: offset
    });

    const total = await prisma.templateSentHistory.count({
      where: { kineId }
    });

    return { success: true, history, total, limit, offset };

  } catch (error) {
    logger.error('Erreur getHistory:', error.message);
    throw error;
  }
}

/**
 * Supprime une entrée d'historique (ownership check)
 */
async function deleteHistoryEntry(historyId, kineId) {
  const prisma = prismaService.getInstance();
  const entry = await prisma.templateSentHistory.findUnique({ where: { id: historyId } });

  if (!entry || entry.kineId !== kineId) {
    throw new Error('Entrée introuvable ou accès refusé');
  }

  await prisma.templateSentHistory.delete({ where: { id: historyId } });
  logger.debug(`Historique supprimé: ${historyId} (kiné ${kineId})`);
}

/**
 * Supprime tout l'historique d'un kiné
 */
async function deleteAllHistory(kineId) {
  const prisma = prismaService.getInstance();
  const result = await prisma.templateSentHistory.deleteMany({ where: { kineId } });
  logger.debug(`Historique purgé: ${result.count} entrées (kiné ${kineId})`);
  return result.count;
}

module.exports = {
  personalizeTemplate,
  getAllTemplates,
  getCategories,
  saveToHistory,
  getHistory,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  deleteHistoryEntry,
  deleteAllHistory
};
