const prismaService = require('../services/prismaService');
const { generateChatUrl } = require('../services/patientTokenService');

// 🔽 GET tous les programmes actifs du kiné connecté
exports.getAllProgrammesByKine = async (req, res) => {
  try {
    const prisma = prismaService.getInstance();
    
    // Récupérer l'UID Firebase depuis le middleware d'authentification
    const kineUid = req.uid; // Défini par votre middleware authenticate.js
    
    if (!kineUid) {
      console.error('❌ UID Firebase manquant dans req.uid');
      return res.status(401).json({ 
        error: "Authentification invalide - UID manquant"
      });
    }
    
    console.log('✅ UID Firebase utilisé:', kineUid);
    
    const programmes = await prisma.programme.findMany({
      where: {
        isArchived: false,
        patient: {
          kine: {
            uid: kineUid // Filtrer par le kiné connecté via son UID Firebase
          }
        }
      },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true
          }
        },
        _count: {
          select: { 
            exercices: true,
            chatSessions: true
          }
        }
      },
      orderBy: { dateDebut: 'desc' }
    });
    
    console.log(`✅ Trouvé ${programmes.length} programmes pour le kiné ${kineUid}`);
    res.json(programmes);
  } catch (error) {
    console.error("Erreur récupération programmes kiné :", error);
    res.status(500).json({ error: "Erreur récupération programmes" });
  }
};

// 🔽 GET programmes actifs (pas archivés)
exports.getProgrammesByPatient = async (req, res) => {
  const patientId = parseInt(req.params.patientId);
    try {
    const prisma = prismaService.getInstance();
    
    const programmes = await prisma.programme.findMany({
      where: {
        patientId,
        isArchived: false
      },
      include: {
        exercices: {
          include: { exerciceModele: true }
        }
      }
    });
    res.json(programmes);
  } catch (error) {
    console.error("Erreur récupération programmes :", error);
    res.status(500).json({ error: "Erreur récupération programmes" });
  }
};

// 🔽 POST création programme
exports.createProgramme = async (req, res) => {
  const { titre, description, duree, patientId, dateFin, exercises } = req.body;

  try {
    const prisma = prismaService.getInstance();
    
    const newProgramme = await prisma.programme.create({
      data: {
        titre,
        description,
        duree,
        patientId,
        dateFin,
        exercices: {
          create: exercises.map(ex => ({
            exerciceModele: { connect: { id: ex.exerciceId } },
            series: ex.series,
            repetitions: ex.repetitions,
            pause: ex.tempsRepos,
            consigne: ex.instructions || '',
          }))
        }
      },
      include: {
        exercices: {
          include: { exerciceModele: true }
        }
      }
    });

    res.json(newProgramme);
  } catch (error) {
    console.error("Erreur création programme :", error);
    res.status(500).json({ error: "Erreur création programme" });
  }
};

// 🔽 POST génération du lien de chat pour un programme
exports.generateProgrammeLink = async (req, res) => {
  const programmeId = parseInt(req.params.programmeId);
  
  console.log("Génération lien pour programme ID:", programmeId);

  try {
    const prisma = prismaService.getInstance();
    
    // Récupérer le programme avec les infos patient
    const programme = await prisma.programme.findUnique({
      where: { id: programmeId },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true
          }
        }
      }
    });

    console.log("Programme trouvé:", programme ? "Oui" : "Non");

    if (!programme) {
      return res.status(404).json({ 
        success: false, 
        error: "Programme non trouvé" 
      });
    }

    if (programme.isArchived) {
      return res.status(400).json({ 
        success: false, 
        error: "Impossible de générer un lien pour un programme archivé" 
      });
    }

    // Générer le lien de chat
    console.log("Génération du token pour:", {
      patientId: programme.patientId,
      programmeId: programme.id,
      dateFin: programme.dateFin
    });

    const linkResult = generateChatUrl(
      programme.patientId, 
      programme.id, 
      programme.dateFin
    );

    console.log("Résultat génération lien:", linkResult);

    if (!linkResult.success) {
      return res.status(500).json({
        success: false,
        error: "Erreur lors de la génération du lien",
        details: linkResult.error
      });
    }

    res.json({
      success: true,
      programme: {
        id: programme.id,
        titre: programme.titre,
        patient: {
          id: programme.patient.id,
          nom: `${programme.patient.firstName} ${programme.patient.lastName}`,
          phone: programme.patient.phone
        }
      },
      chatLink: linkResult.chatUrl,
      token: linkResult.token,
      expiresAt: linkResult.expiresAt,
      message: `Lien généré avec succès pour ${programme.patient.firstName} ${programme.patient.lastName}`
    });

  } catch (error) {
    console.error("Erreur génération lien programme :", error);
    res.status(500).json({ 
      success: false, 
      error: "Erreur serveur lors de la génération du lien",
      details: error.message 
    });
  }
};

// 🔽 PUT modification programme
exports.updateProgramme = async (req, res) => {
  const programmeId = parseInt(req.params.id);
  const { titre, description, duree, exercises } = req.body;

  try {
    const prisma = prismaService.getInstance();
    
    // Supprimer les anciens exercices du programme
    await prisma.exerciceProgramme.deleteMany({ 
      where: { programmeId } 
    });

    // Mettre à jour le programme avec les nouveaux exercices
    const updatedProgramme = await prisma.programme.update({
      where: { id: programmeId },
      data: {
        titre,
        description,
        duree,
        exercices: {
          create: exercises.map(ex => ({
            exerciceModele: { connect: { id: ex.exerciceId } },
            series: ex.series,
            repetitions: ex.repetitions,
            pause: ex.tempsRepos,
            consigne: ex.instructions || '',
          }))
        }
      },
      include: { 
        exercices: { 
          include: { exerciceModele: true } 
        } 
      }
    });

    res.json(updatedProgramme);
  } catch (error) {
    console.error("Erreur mise à jour programme :", error);
    res.status(500).json({ error: "Erreur mise à jour programme" });
  }
};

// 🔽 DELETE programme (suppression définitive)
exports.deleteProgramme = async (req, res) => {
  const programmeId = parseInt(req.params.id);

  try {
    const prisma = prismaService.getInstance();
    
    // Supprimer d'abord les exercices liés
    await prisma.exerciceProgramme.deleteMany({ 
      where: { programmeId } 
    });
    
    // Puis supprimer le programme
    await prisma.programme.delete({ 
      where: { id: programmeId } 
    });

    res.json({ message: "Programme supprimé avec succès" });
  } catch (error) {
    console.error("Erreur suppression programme :", error);
    res.status(500).json({ error: "Erreur suppression programme" });
  }
};

// 🔽 PATCH archiver programme (alternative plus douce à DELETE)
exports.archiveProgramme = async (req, res) => {
  const programmeId = parseInt(req.params.id);

  try {
    const prisma = prismaService.getInstance();
    
    const archivedProgramme = await prisma.programme.update({
      where: { id: programmeId },
      data: { isArchived: true },
      include: {
        exercices: {
          include: { exerciceModele: true }
        }
      }
    });

    res.json(archivedProgramme);
  } catch (error) {
    console.error("Erreur archivage programme :", error);
    res.status(500).json({ error: "Erreur archivage programme" });
  }
};