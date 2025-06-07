const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// 🔽 GET programmes actifs (pas archivés)
exports.getProgrammesByPatient = async (req, res) => {
  const patientId = parseInt(req.params.id);
  try {
    const programmes = await prisma.programme.findMany({
      where: {
        patientId,
        archived: false
      },
      include: {
        exercises: {
          include: { exercice: true }
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
  const { titre, description, duree, patientId, exercises } = req.body;
  try {
    const newProgramme = await prisma.programme.create({
      data: {
        titre,
        description,
        duree,
        patientId,
        exercises: {
          create: exercises.map(ex => ({
            exerciceId: ex.exerciceId,
            series: ex.series,
            repetitions: ex.repetitions,
            tempsRepos: ex.tempsRepos
          }))
        }
      },
      include: { exercises: { include: { exercice: true } } }
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
    // Supprimer les anciens exercices liés
    await prisma.exerciceProgramme.deleteMany({ where: { programmeId } });

    // Mettre à jour le programme
    const updatedProgramme = await prisma.programme.update({
      where: { id: programmeId },
      data: {
        titre,
        description,
        duree,
        exercises: {
          create: exercises.map(ex => ({
            exerciceId: ex.exerciceId,
            series: ex.series,
            repetitions: ex.repetitions,
            tempsRepos: ex.tempsRepos
          }))
        }
      },
      include: { exercises: { include: { exercice: true } } }
    });

    res.json(updatedProgramme);
  } catch (error) {
    console.error("Erreur mise à jour programme :", error);
    res.status(500).json({ error: "Erreur mise à jour programme" });
  }
};

// 🔽 DELETE programme
exports.deleteProgramme = async (req, res) => {
  const programmeId = parseInt(req.params.id);

  try {
    // Supprimer d'abord les exercices liés
    await prisma.exerciceProgramme.deleteMany({ where: { programmeId } });

    // Supprimer le programme
    await prisma.programme.delete({ where: { id: programmeId } });

    res.json({ message: "Programme supprimé avec succès" });
  } catch (error) {
    console.error("Erreur suppression programme :", error);
    res.status(500).json({ error: "Erreur suppression programme" });
  }
};

