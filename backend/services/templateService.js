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

/**
 * Échappe les caractères spéciaux pour regex
 */
function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extrait toutes les variables [xxx] d'un texte
 */
function extractVariables(text) {
  const regex = /\[([^\]]+)\]/g;
  const variables = new Set();
  let match;

  while ((match = regex.exec(text)) !== null) {
    variables.add(match[0]); // Garde le format [Variable]
  }

  return Array.from(variables);
}

/**
 * Remplace une variable dans le texte
 */
function replaceVariable(text, variable, value) {
  const regex = new RegExp(escapeRegex(variable), 'g');
  return text.replace(regex, value);
}

// ========== FONCTIONS PRINCIPALES ==========

/**
 * Personnalise un template avec les données patient/kiné
 *
 * @param {Object} params
 * @param {number} params.templateId - ID du template
 * @param {number} params.patientId - ID du patient
 * @param {number} params.kineId - ID du kiné
 * @returns {Promise<Object>} Template personnalisé avec variables détectées
 */
async function personalizeTemplate({ templateId, patientId, kineId }) {
  try {
    const prisma = prismaService.getInstance();

    // 1. Récupérer le template
    const template = await prisma.adminTemplate.findUnique({
      where: { id: templateId }
    });

    if (!template) {
      throw new Error(`Template ${templateId} introuvable`);
    }

    // 2. Récupérer les données patient et kiné
    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        emailConsent: true,
        whatsappConsent: true
      }
    });

    if (!patient) {
      throw new Error(`Patient ${patientId} introuvable`);
    }

    const kine = await prisma.kine.findUnique({
      where: { id: kineId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        adresseCabinet: true
      }
    });

    if (!kine) {
      throw new Error(`Kiné ${kineId} introuvable`);
    }

    // 3. Auto-fill des variables reconnues
    let personalizedBody = template.body;
    let personalizedSubject = template.subject || '';
    const autoFilledVariables = [];

    Object.entries(AUTO_FILL_VARIABLES).forEach(([variable, extractFn]) => {
      const value = extractFn({ patient, kine });

      // Vérifier si la variable existe dans le body ou subject
      if (personalizedBody.includes(variable) || personalizedSubject.includes(variable)) {
        personalizedBody = replaceVariable(personalizedBody, variable, value);
        personalizedSubject = replaceVariable(personalizedSubject, variable, value);

        autoFilledVariables.push({
          variable,
          value,
          replaced: true
        });
      }
    });

    // 4. Détecter les variables restantes (à compléter manuellement)
    const remainingVariables = extractVariables(personalizedBody);

    logger.debug(`✅ Template ${template.title} personnalisé pour patient ${patient.lastName}`);
    logger.debug(`📝 Variables auto-remplies: ${autoFilledVariables.length}`);
    logger.debug(`⚠️ Variables restantes: ${remainingVariables.length}`);

    return {
      success: true,
      template: {
        id: template.id,
        title: template.title,
        category: template.category,
        originalBody: template.body,
        originalSubject: template.subject
      },
      personalizedBody,
      personalizedSubject,
      autoFilledVariables,
      remainingVariables,
      patient: {
        id: patient.id,
        firstName: patient.firstName,
        lastName: patient.lastName,
        email: patient.email,
        phone: patient.phone,
        emailConsent: patient.emailConsent,
        whatsappConsent: patient.whatsappConsent
      },
      kine: {
        id: kine.id,
        firstName: kine.firstName,
        lastName: kine.lastName
      }
    };

  } catch (error) {
    logger.error('❌ Erreur personalizeTemplate:', error.message);
    throw error;
  }
}

/**
 * Récupère tous les templates avec filtres optionnels
 *
 * @param {Object} filters
 * @param {string} [filters.category] - Filtrer par catégorie
 * @param {string} [filters.search] - Recherche texte (titre, body, tags)
 * @returns {Promise<Array>} Liste des templates
 */
async function getAllTemplates({ category, search } = {}) {
  try {
    const prisma = prismaService.getInstance();

    const where = {};

    // Filtre par catégorie
    if (category) {
      where.category = category;
    }

    // Recherche texte (titre ou tags)
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { tags: { has: search.toLowerCase() } }
      ];
    }

    const templates = await prisma.adminTemplate.findMany({
      where,
      orderBy: [
        { category: 'asc' },
        { title: 'asc' }
      ]
    });

    logger.debug(`📋 ${templates.length} templates récupérés`);

    return {
      success: true,
      templates,
      count: templates.length
    };

  } catch (error) {
    logger.error('❌ Erreur getAllTemplates:', error.message);
    throw error;
  }
}

/**
 * Récupère les catégories avec compteurs
 *
 * @returns {Promise<Array>} Liste des catégories avec nombre de templates
 */
async function getCategories() {
  try {
    const prisma = prismaService.getInstance();

    const templates = await prisma.adminTemplate.findMany({
      select: { category: true }
    });

    // Compter par catégorie
    const categoriesCount = {};
    templates.forEach(t => {
      categoriesCount[t.category] = (categoriesCount[t.category] || 0) + 1;
    });

    const categories = Object.entries(categoriesCount).map(([name, count]) => ({
      name,
      count
    }));

    logger.debug(`📂 ${categories.length} catégories trouvées`);

    return {
      success: true,
      categories
    };

  } catch (error) {
    logger.error('❌ Erreur getCategories:', error.message);
    throw error;
  }
}

/**
 * Sauvegarde un envoi dans l'historique
 *
 * @param {Object} params
 * @param {number} params.kineId - ID du kiné
 * @param {number} params.patientId - ID du patient
 * @param {number} params.templateId - ID du template
 * @param {string} params.templateTitle - Titre du template
 * @param {string} params.subject - Objet final
 * @param {string} params.body - Corps final
 * @param {string} params.method - 'EMAIL' ou 'WHATSAPP'
 * @returns {Promise<Object>} Historique créé
 */
async function saveToHistory({
  kineId,
  patientId,
  templateId,
  templateTitle,
  subject,
  body,
  method = 'EMAIL'
}) {
  try {
    const prisma = prismaService.getInstance();

    // Récupérer patient pour email/phone
    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      select: { email: true, phone: true }
    });

    const history = await prisma.templateSentHistory.create({
      data: {
        kineId,
        patientId,
        templateId,
        templateTitle,
        subject,
        body,
        patientEmail: method === 'EMAIL' ? patient.email : null,
        patientPhone: method === 'WHATSAPP' ? patient.phone : null,
        method
      }
    });

    // Incrémenter compteur d'usage du template
    await prisma.adminTemplate.update({
      where: { id: templateId },
      data: {
        usageCount: { increment: 1 }
      }
    });

    logger.info(`💾 Envoi sauvegardé - Template: ${templateTitle}, Méthode: ${method}`);

    return {
      success: true,
      history
    };

  } catch (error) {
    logger.error('❌ Erreur saveToHistory:', error.message);
    throw error;
  }
}

/**
 * Récupère l'historique des envois pour un kiné
 *
 * @param {number} kineId - ID du kiné
 * @param {Object} options
 * @param {number} [options.limit=50] - Limite de résultats
 * @param {number} [options.offset=0] - Offset pour pagination
 * @returns {Promise<Object>} Historique des envois
 */
async function getHistory(kineId, { limit = 50, offset = 0 } = {}) {
  try {
    const prisma = prismaService.getInstance();

    const history = await prisma.templateSentHistory.findMany({
      where: { kineId },
      include: {
        patient: {
          select: {
            firstName: true,
            lastName: true
          }
        },
        template: {
          select: {
            title: true,
            category: true
          }
        }
      },
      orderBy: { sentAt: 'desc' },
      take: limit,
      skip: offset
    });

    const total = await prisma.templateSentHistory.count({
      where: { kineId }
    });

    logger.debug(`📜 ${history.length} envois récupérés pour kiné ${kineId}`);

    return {
      success: true,
      history,
      total,
      limit,
      offset
    };

  } catch (error) {
    logger.error('❌ Erreur getHistory:', error.message);
    throw error;
  }
}

module.exports = {
  personalizeTemplate,
  getAllTemplates,
  getCategories,
  saveToHistory,
  getHistory
};
