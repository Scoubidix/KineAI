// ==========================================
// FICHIER: kineController.js (VERSION FINALE AVEC LOGIQUE CONDITIONNELLE)
// ==========================================

const prismaService = require('../services/prismaService');
const logger = require('../utils/logger');
const { sanitizeUID, sanitizeEmail, sanitizeId, sanitizeName } = require('../utils/logSanitizer');

const createKine = async (req, res) => {
  const { uid, email, firstName, lastName, phone, rpps, adresseCabinet, birthDate } = req.body;

  logger.warn("📥 Création kiné - UID:", sanitizeUID(req.body.uid));

  try {
    const prisma = prismaService.getInstance();
    
    const existing = await prisma.kine.findUnique({
      where: { uid },
    });

    if (existing) {
      return res.status(409).json({ error: 'Un kiné avec ce UID existe déjà.' });
    }

    const newKine = await prisma.kine.create({
      data: {
        uid,
        email,
        firstName,
        lastName,
        phone,
        rpps,
        adresseCabinet,
        birthDate: new Date(birthDate),
      },
    });

    logger.warn("✅ Kiné créé - ID:", sanitizeId(newKine.id), "Email:", sanitizeEmail(newKine.email));

    return res.status(201).json(newKine);
  } catch (err) {
    logger.error("❌ Erreur création kiné:", err.message);
    return res.status(500).json({ error: 'Erreur serveur lors de la création du kiné.' });
  }
};

const getKineProfile = async (req, res) => {
  const uid = req.uid; // Récupéré depuis le middleware authenticate

  logger.info("📥 Récupération profil kiné pour UID:", sanitizeUID(uid));

  try {
    const prisma = prismaService.getInstance();
    
    const kine = await prisma.kine.findUnique({
      where: { uid },
      include: {
        patients: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          }
        },
        _count: {
          select: {
            patients: true,
            exercicesModeles: true,
          }
        }
      }
    });

    if (!kine) {
      logger.error("❌ Kiné non trouvé pour UID:", sanitizeUID(uid));
      return res.status(404).json({ error: 'Kiné non trouvé dans la base de données.' });
    }

    logger.info("✅ Profil kiné récupéré - ID:", sanitizeId(kine.id));

    return res.status(200).json(kine);
  } catch (err) {
    logger.error("❌ Erreur récupération profil kiné:", err.message);
    return res.status(500).json({ error: 'Erreur serveur lors de la récupération du profil.' });
  }
};

const updateKineProfile = async (req, res) => {
  const uid = req.uid; // Récupéré depuis le middleware authenticate
  const { email, phone, adresseCabinet } = req.body;

  logger.info("📥 Mise à jour profil kiné pour UID:", sanitizeUID(uid));

  try {
    const prisma = prismaService.getInstance();
    
    // Vérifier que le kiné existe
    const existingKine = await prisma.kine.findUnique({
      where: { uid }
    });

    if (!existingKine) {
      logger.error("❌ Kiné non trouvé pour UID:", sanitizeUID(uid));
      return res.status(404).json({ error: 'Kiné non trouvé dans la base de données.' });
    }

    // Validation basique des données
    if (email && !email.includes('@')) {
      return res.status(400).json({ error: 'Format email invalide.' });
    }

    // Préparer les données à mettre à jour (seulement les champs fournis)
    const updateData = {};
    if (email !== undefined) updateData.email = email;
    if (phone !== undefined) updateData.phone = phone;
    if (adresseCabinet !== undefined) updateData.adresseCabinet = adresseCabinet;

    // Mettre à jour le profil
    const updatedKine = await prisma.kine.update({
      where: { uid },
      data: updateData,
      select: {
        id: true,
        uid: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        rpps: true,
        adresseCabinet: true,
        birthDate: true,
        updatedAt: true
      }
    });

    logger.info("✅ Profil kiné mis à jour - ID:", sanitizeId(updatedKine.id));

    return res.status(200).json({
      message: 'Profil mis à jour avec succès',
      kine: updatedKine
    });

  } catch (err) {
    logger.error("❌ Erreur mise à jour profil kiné:", err.message);
    return res.status(500).json({ error: 'Erreur serveur lors de la mise à jour du profil.' });
  }
};

// ==========================================
// NOUVELLES FONCTIONS POUR LE SUIVI D'ADHÉRENCE
// AVEC LOGIQUE CONDITIONNELLE POUR L'ARCHIVAGE
// ==========================================

/**
 * GET /kine/adherence/:date
 * Calculer l'adhérence globale pour une date donnée
 * LOGIQUE: Aujourd'hui = programmes actifs seulement, Passé = tous programmes
 * 🔧 FIX: Comparaison dates jour seulement + timezone uniforme
 */
const getAdherenceByDate = async (req, res) => {
  const uid = req.uid; // UID du kiné authentifié
  const { date } = req.params; // Format: YYYY-MM-DD

  logger.info("📊 Calcul adhérence pour UID:", sanitizeUID(uid), "Date:", date);

  try {
    // 🔧 FIX TIMEZONE: Utiliser la même méthode que patientChat.js
    // Créer la date cible en timezone Paris pour cohérence
    const targetDateStr = date; // YYYY-MM-DD
    const tempDate = new Date(targetDateStr + 'T12:00:00'); // Midi pour éviter les décalages
    const parisTime = new Date(tempDate.toLocaleString("en-US", {timeZone: "Europe/Paris"}));
    const targetDate = new Date(Date.UTC(parisTime.getFullYear(), parisTime.getMonth(), parisTime.getDate()));

    logger.debug("🔧 TIMEZONE FIX:", date, "→", targetDate.toISOString());

    // 🔧 LOGIQUE CONDITIONNELLE POUR L'ARCHIVAGE
    const now = new Date();
    const nowParis = new Date(now.toLocaleString("en-US", {timeZone: "Europe/Paris"}));
    const today = new Date(Date.UTC(nowParis.getFullYear(), nowParis.getMonth(), nowParis.getDate()));
    const isToday = targetDate.getTime() === today.getTime();

    const prisma = prismaService.getInstance();

    // 1. Récupérer le kiné et vérifier son existence
    const kine = await prisma.kine.findUnique({
      where: { uid },
      select: { id: true, firstName: true, lastName: true }
    });

    if (!kine) {
      return res.status(404).json({ 
        success: false,
        error: 'Kiné non trouvé.' 
      });
    }

    // 🔧 FIX: Créer les dates de début et fin de la journée cible
    const targetDateStart = new Date(targetDate);
    targetDateStart.setHours(0, 0, 0, 0);
    
    const targetDateEnd = new Date(targetDate);
    targetDateEnd.setHours(23, 59, 59, 999);

    // 2. Construire la requête avec logique conditionnelle ET comparaison jour seulement
    const whereClause = {
      patient: {
        kineId: kine.id,
        isActive: true // Filtrer les patients supprimés
      },
      isActive: true, // Filtrer les programmes supprimés
      // ✅ FIX: Utiliser une logique qui fonctionne pour toute heure de création
      AND: [
        {
          OR: [
            // Programme commence aujourd'hui ou avant
            { dateDebut: { lte: targetDateEnd } },
          ]
        },
        {
          OR: [
            // Programme finit aujourd'hui ou après
            { dateFin: { gte: targetDateStart } },
          ]
        }
      ]
    };

    // ✅ SEULEMENT pour aujourd'hui, exclure les programmes archivés
    if (isToday) {
      whereClause.isArchived = false;
    }
    // Pour les dates passées, inclure TOUS les programmes (archivés ou non)

    logger.debug("🔍 Query adhérence construite");

    // 3. Trouver tous les programmes pertinents pour cette date
    const activeProgrammes = await prisma.programme.findMany({
      where: whereClause,
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true
          }
        },
        sessionValidations: {
          where: {
            date: targetDate // ✅ MÊME DATE QUE LA VALIDATION
          }
        }
      }
    });

    logger.debug("🔍 Programmes trouvés:", activeProgrammes.length);

    // 4. Calculer les statistiques
    const totalPatients = activeProgrammes.length;
    const validatedPatients = activeProgrammes.filter(
      programme => programme.sessionValidations.some(validation => validation.isValidated)
    ).length;

    const adherencePercentage = totalPatients > 0 
      ? Math.round((validatedPatients / totalPatients) * 100)
      : 0;

    // 5. Calculer les moyennes de douleur et difficulté
    const validations = activeProgrammes
      .flatMap(p => p.sessionValidations)
      .filter(v => v.isValidated && v.painLevel !== null && v.difficultyLevel !== null);

    const avgPainLevel = validations.length > 0
      ? Math.round((validations.reduce((sum, v) => sum + v.painLevel, 0) / validations.length) * 10) / 10
      : null;

    const avgDifficultyLevel = validations.length > 0
      ? Math.round((validations.reduce((sum, v) => sum + v.difficultyLevel, 0) / validations.length) * 10) / 10
      : null;

    // 6. Construire la réponse
    const response = {
      success: true,
      date: targetDate.toISOString().split('T')[0], // Format YYYY-MM-DD
      isToday: isToday,                               // 🆕 Nouveau flag
      isHistorical: !isToday,                         // 🆕 Pour l'UI
      dataScope: isToday ? 'active_only' : 'all_programmes', // 🆕 Type de données
      adherence: {
        totalPatients,
        validatedPatients,
        percentage: adherencePercentage
      },
      metrics: {
        avgPainLevel,
        avgDifficultyLevel,
        validationsCount: validations.length
      },
      kine: {
        id: kine.id,
        nom: `${kine.firstName} ${kine.lastName}`
      },
      timestamp: new Date().toISOString()
    };

    logger.info("✅ Adhérence calculée:", `${validatedPatients}/${totalPatients} (${adherencePercentage}%)`);

    res.json(response);

  } catch (err) {
    logger.error("❌ Erreur calcul adhérence:", err.message);
    res.status(500).json({ 
      success: false,
      error: 'Erreur serveur lors du calcul de l\'adhérence.',
      details: err.message
    });
  }
};

/**
 * GET /kine/patients-sessions/:date
 * Récupérer la liste détaillée des patients et leur statut de validation pour une date
 * LOGIQUE: Aujourd'hui = programmes actifs seulement, Passé = tous programmes
 * 🔧 FIX: Comparaison dates jour seulement + timezone uniforme
 */
const getPatientSessionsByDate = async (req, res) => {
  const uid = req.uid; // UID du kiné authentifié
  const { date } = req.params; // Format: YYYY-MM-DD

  logger.info("📋 Liste patients-sessions pour UID:", sanitizeUID(uid), "Date:", date);

  try {
    // 🔧 FIX TIMEZONE: Utiliser la même méthode que patientChat.js
    // Créer la date cible en timezone Paris pour cohérence
    const targetDateStr = date; // YYYY-MM-DD
    const tempDate = new Date(targetDateStr + 'T12:00:00'); // Midi pour éviter les décalages
    const parisTime = new Date(tempDate.toLocaleString("en-US", {timeZone: "Europe/Paris"}));
    const targetDate = new Date(Date.UTC(parisTime.getFullYear(), parisTime.getMonth(), parisTime.getDate()));

    logger.debug("🔧 TIMEZONE FIX:", date, "→", targetDate.toISOString());

    // 🔧 LOGIQUE CONDITIONNELLE POUR L'ARCHIVAGE
    const now = new Date();
    const nowParis = new Date(now.toLocaleString("en-US", {timeZone: "Europe/Paris"}));
    const today = new Date(Date.UTC(nowParis.getFullYear(), nowParis.getMonth(), nowParis.getDate()));
    const isToday = targetDate.getTime() === today.getTime();

    const prisma = prismaService.getInstance();

    // 1. Récupérer le kiné et vérifier son existence
    const kine = await prisma.kine.findUnique({
      where: { uid },
      select: { id: true, firstName: true, lastName: true }
    });

    if (!kine) {
      return res.status(404).json({ 
        success: false,
        error: 'Kiné non trouvé.' 
      });
    }

    // 🔧 FIX: Créer les dates de début et fin de la journée cible
    const targetDateStart = new Date(targetDate);
    targetDateStart.setHours(0, 0, 0, 0);
    
    const targetDateEnd = new Date(targetDate);
    targetDateEnd.setHours(23, 59, 59, 999);

    // 2. Construire la requête avec logique conditionnelle ET comparaison jour seulement
    const whereClause = {
      patient: {
        kineId: kine.id,
        isActive: true // Filtrer les patients supprimés
      },
      isActive: true, // Filtrer les programmes supprimés
      // ✅ FIX: Utiliser une logique qui fonctionne pour toute heure de création
      AND: [
        {
          OR: [
            // Programme commence aujourd'hui ou avant
            { dateDebut: { lte: targetDateEnd } },
          ]
        },
        {
          OR: [
            // Programme finit aujourd'hui ou après
            { dateFin: { gte: targetDateStart } },
          ]
        }
      ]
    };

    // ✅ SEULEMENT pour aujourd'hui, exclure les programmes archivés
    if (isToday) {
      whereClause.isArchived = false;
    }
    // Pour les dates passées, inclure TOUS les programmes (archivés ou non)

    logger.debug("🔍 Query patients-sessions construite");

    // 3. Récupérer tous les patients avec programmes pertinents pour cette date
    const patientsWithSessions = await prisma.programme.findMany({
      where: whereClause,
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            birthDate: true
          }
        },
        sessionValidations: {
          where: {
            date: targetDate // ✅ MÊME DATE QUE LA VALIDATION
          }
        }
      },
      orderBy: {
        patient: {
          lastName: 'asc'
        }
      }
    });

    logger.debug("🔍 Patients avec sessions trouvés:", patientsWithSessions.length);
    
    // Debug: Validations trouvées (niveau debug uniquement)
    logger.debug("🔍 Détails validations par programme disponibles");

    // 4. Formatter les données pour la réponse
    const patients = patientsWithSessions.map(programme => {
      const validation = programme.sessionValidations[0]; // Il ne peut y en avoir qu'une par date
      
      return {
        patient: {
          id: programme.patient.id,
          firstName: programme.patient.firstName,
          lastName: programme.patient.lastName,
          nom: `${programme.patient.firstName} ${programme.patient.lastName}`,
          age: calculateAge(programme.patient.birthDate)
        },
        programme: {
          id: programme.id,
          titre: programme.titre,
          dateDebut: programme.dateDebut,
          dateFin: programme.dateFin,
          isArchived: programme.isArchived  // 🆕 Info archivage
        },
        session: {
          isValidated: !!validation?.isValidated,
          painLevel: validation?.painLevel || null,
          difficultyLevel: validation?.difficultyLevel || null,
          validatedAt: validation?.validatedAt || null
        }
      };
    });

    // 5. Calculer les statistiques rapides
    const totalPatients = patients.length;
    const validatedCount = patients.filter(p => p.session.isValidated).length;
    const adherencePercentage = totalPatients > 0 
      ? Math.round((validatedCount / totalPatients) * 100)
      : 0;

    const response = {
      success: true,
      date: targetDate.toISOString().split('T')[0],
      isToday: isToday,                               // 🆕 Nouveau flag
      isHistorical: !isToday,                         // 🆕 Pour l'UI
      dataScope: isToday ? 'active_only' : 'all_programmes', // 🆕 Type de données
      summary: {
        totalPatients,
        validatedCount,
        pendingCount: totalPatients - validatedCount,
        adherencePercentage
      },
      patients,
      kine: {
        id: kine.id,
        nom: `${kine.firstName} ${kine.lastName}`
      },
      timestamp: new Date().toISOString()
    };

    logger.info("✅ Liste patients-sessions récupérée:", `${validatedCount}/${totalPatients} patients`);

    res.json(response);

  } catch (err) {
    logger.error("❌ Erreur récupération patients-sessions:", err.message);
    res.status(500).json({ 
      success: false,
      error: 'Erreur serveur lors de la récupération des sessions patients.',
      details: err.message
    });
  }
};

// Fonction utilitaire pour calculer l'âge
function calculateAge(birthDateStr) {
  const birthDate = new Date(birthDateStr);
  const ageDiff = Date.now() - birthDate.getTime();
  return Math.floor(ageDiff / (1000 * 60 * 60 * 24 * 365.25));
}

module.exports = { 
  createKine, 
  getKineProfile, 
  updateKineProfile,
  getAdherenceByDate,      // NOUVELLE FONCTION AVEC LOGIQUE CONDITIONNELLE
  getPatientSessionsByDate // NOUVELLE FONCTION AVEC LOGIQUE CONDITIONNELLE
};