const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// 🔽 GET programmes actifs (pas archivés)
exports.getProgrammesByPatient = async (req, res) => {
  const patientId = parseInt(req.params.patientId);
  console.log("patientId reçu :", req.params.patientId);
  try {
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

// 🔽 PUT modification programme
exports.updateProgramme = async (req, res) => {
  const programmeId = parseInt(req.params.id);
  const { titre, description, duree, exercises } = req.body;

  try {
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