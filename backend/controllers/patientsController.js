const prismaService = require('../services/prismaService');
const { sanitizeName, sanitizeId } = require('../utils/logSanitizer');

const logger = require('../utils/logger');
// 🔐 Toutes les routes supposent que req.uid est défini par le middleware authenticate

// GET /patients
exports.getPatients = async (req, res) => {
  try {
    const firebaseUid = req.uid;
    const prisma = prismaService.getInstance();
    
    const kine = await prisma.kine.findUnique({
      where: { uid: firebaseUid },
    });

    if (!kine) {
      return res.status(404).json({ error: "Kiné introuvable avec ce UID Firebase." });
    }

    const patients = await prisma.patient.findMany({
      where: { 
        kineId: kine.id,
        isActive: true // Filtrer les patients supprimés
      },
    });

    res.json(patients);
  } catch (err) {
    logger.error("Erreur récupération patients :", err);
    res.status(500).json({ error: "Erreur récupération patients" });
  }
};

// GET /patients/:id (pour un seul patient)
exports.getPatientById = async (req, res) => {
  const { id } = req.params;
  const firebaseUid = req.uid;

  try {
    const prisma = prismaService.getInstance();
    
    const kine = await prisma.kine.findUnique({
      where: { uid: firebaseUid },
    });

    if (!kine) {
      return res.status(404).json({ error: "Kiné introuvable avec ce UID Firebase." });
    }

    const patient = await prisma.patient.findFirst({
      where: {
        id: parseInt(id),
        kineId: kine.id, // Assure que le kiné a bien accès à ce patient
        isActive: true // Filtrer les patients supprimés
      },
    });

    if (!patient) {
      return res.status(404).json({ error: "Patient introuvable pour ce kiné." });
    }

    res.json(patient);
  } catch (err) {
    logger.error("Erreur récupération patient :", err);
    res.status(500).json({ error: "Erreur récupération patient" });
  }
};

// POST /patients
exports.createPatient = async (req, res) => {
  try {
    const firebaseUid = req.uid;
    const prisma = prismaService.getInstance();

    const kine = await prisma.kine.findUnique({
      where: { uid: firebaseUid },
    });

    if (!kine) {
      return res.status(404).json({ error: "Kiné introuvable avec ce UID Firebase." });
    }

    const {
      firstName,
      lastName,
      birthDate,
      email,
      phone,
      goals
    } = req.body;

    const newPatient = await prisma.patient.create({
      data: {
        firstName,
        lastName,
        birthDate: new Date(birthDate),
        email,
        phone,
        goals,
        kineId: kine.id,
        // Consentements activés par défaut (formulaire signé)
        emailConsent: true,
        whatsappConsent: true,
      },
    });

    logger.info(`✅ Patient créé avec consentements: ${sanitizeName(firstName)} ${sanitizeName(lastName)} (ID: ${sanitizeId(newPatient.id)})`);
    res.status(201).json(newPatient);
  } catch (err) {
    logger.error("Erreur création patient :", err);
    res.status(500).json({ error: "Erreur création patient" });
  }
};

// PUT /patients/:id
exports.updatePatient = async (req, res) => {
  const { id } = req.params;
  const firebaseUid = req.uid;
  const {
    firstName,
    lastName,
    birthDate,
    email,
    phone,
    goals
  } = req.body;

  try {
    const prisma = prismaService.getInstance();
    
    const kine = await prisma.kine.findUnique({
      where: { uid: firebaseUid },
    });

    if (!kine) {
      return res.status(404).json({ error: "Kiné introuvable avec ce UID Firebase." });
    }

    // Vérifier ownership avant modification
    const patient = await prisma.patient.findFirst({
      where: { 
        id: parseInt(id),
        kineId: kine.id,
        isActive: true
      }
    });

    if (!patient) {
      return res.status(404).json({ error: "Patient non trouvé ou accès refusé" });
    }
    
    const updatedPatient = await prisma.patient.update({
      where: { id: parseInt(id) },
      data: {
        firstName,
        lastName,
        birthDate: new Date(birthDate),
        email,
        phone,
        goals,
      },
    });

    res.json(updatedPatient);
  } catch (err) {
    logger.error("Erreur update patient :", err);
    res.status(500).json({ error: "Erreur modification patient" });
  }
};

// DELETE /patients/:id (SOFT DELETE)
exports.deletePatient = async (req, res) => {
  const { id } = req.params;
  const firebaseUid = req.uid;

  try {
    const prisma = prismaService.getInstance();
    
    const kine = await prisma.kine.findUnique({
      where: { uid: firebaseUid },
    });

    if (!kine) {
      return res.status(404).json({ error: "Kiné introuvable avec ce UID Firebase." });
    }

    // Vérifier ownership avant suppression
    const patient = await prisma.patient.findFirst({
      where: { 
        id: parseInt(id),
        kineId: kine.id,
        isActive: true
      }
    });

    if (!patient) {
      return res.status(404).json({ error: "Patient non trouvé ou accès refusé" });
    }
    
    // Soft delete au lieu de suppression définitive
    await prisma.patient.update({
      where: { id: parseInt(id) },
      data: {
        isActive: false,
        deletedAt: new Date()
      }
    });

    res.status(200).json({ message: "Patient supprimé" });
  } catch (err) {
    logger.error("Erreur suppression patient :", err);
    res.status(500).json({ error: "Erreur suppression patient" });
  }
};