const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// 🔐 Toutes les routes supposent que req.uid est défini par le middleware authenticate

exports.getPublicExercices = async (req, res) => {
  try {
    const exercices = await prisma.exerciceModele.findMany({
      where: { isPublic: true },
    });
    res.json(exercices);
  } catch (err) {
    console.error("Erreur récupération exercices publics :", err);
    res.status(500).json({ error: "Erreur récupération exercices publics" });
  }
};

exports.getPrivateExercices = async (req, res) => {
  try {
    const firebaseUid = req.uid;
    const kine = await prisma.kine.findUnique({
      where: { uid: firebaseUid },
    });

    if (!kine) {
      return res.status(404).json({ error: "Kiné introuvable avec ce UID Firebase." });
    }

    const exercices = await prisma.exerciceModele.findMany({
      where: {
        isPublic: false,
        kineId: kine.id,
      },
    });

    res.json(exercices);
  } catch (err) {
    console.error("Erreur récupération exercices privés :", err);
    res.status(500).json({ error: "Erreur récupération exercices privés" });
  }
};

exports.createExercice = async (req, res) => {
  const { nom, description } = req.body;

  try {
    const firebaseUid = req.uid;
    const kine = await prisma.kine.findUnique({
      where: { uid: firebaseUid },
    });

    if (!kine) {
      return res.status(404).json({ error: "Kiné introuvable avec ce UID Firebase." });
    }

    const newExercice = await prisma.exerciceModele.create({
      data: {
        nom,
        description,
        isPublic: false,
        kineId: kine.id,
      },
    });

    res.status(201).json(newExercice);
  } catch (err) {
    console.error("Erreur création exercice :", err);
    res.status(500).json({ error: "Erreur création exercice" });
  }
};

exports.updateExercice = async (req, res) => {
  const { id } = req.params;
  const { nom, description } = req.body;

  try {
    const firebaseUid = req.uid;
    const kine = await prisma.kine.findUnique({
      where: { uid: firebaseUid },
    });

    if (!kine) {
      return res.status(404).json({ error: "Kiné introuvable avec ce UID Firebase." });
    }

    const exercice = await prisma.exerciceModele.findUnique({
      where: { id: parseInt(id) },
    });

    if (!exercice || exercice.kineId !== kine.id || exercice.isPublic) {
      return res.status(403).json({ error: "Non autorisé à modifier cet exercice" });
    }

    const updated = await prisma.exerciceModele.update({
      where: { id: parseInt(id) },
      data: { nom, description },
    });

    res.json(updated);
  } catch (err) {
    console.error("Erreur modification exercice :", err);
    res.status(500).json({ error: "Erreur modification exercice" });
  }
};

exports.deleteExercice = async (req, res) => {
  const { id } = req.params;

  try {
    const firebaseUid = req.uid;
    const kine = await prisma.kine.findUnique({
      where: { uid: firebaseUid },
    });

    if (!kine) {
      return res.status(404).json({ error: "Kiné introuvable avec ce UID Firebase." });
    }

    const exercice = await prisma.exerciceModele.findUnique({
      where: { id: parseInt(id) },
    });

    if (!exercice || exercice.kineId !== kine.id || exercice.isPublic) {
      return res.status(403).json({ error: "Non autorisé à supprimer cet exercice" });
    }

    await prisma.exerciceModele.delete({
      where: { id: parseInt(id) },
    });

    res.status(204).send();
  } catch (err) {
    console.error("Erreur suppression exercice :", err);
    res.status(500).json({ error: "Erreur suppression exercice" });
  }
};
