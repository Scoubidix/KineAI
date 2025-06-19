const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// 🔐 Toutes les routes supposent que req.uid est défini par le middleware authenticate

// Fonction utilitaire pour trier les exercices par ordre alphabétique
const sortExercicesAlphabetically = (exercices) => {
  return exercices.sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' }));
};

// Fonction utilitaire pour filtrer les exercices
const filterExercices = (exercices, search = '', selectedTags = []) => {
  return exercices.filter(ex => {
    // Filtrage par recherche textuelle
    const matchesSearch = !search || 
      ex.nom.toLowerCase().includes(search.toLowerCase()) ||
      ex.description.toLowerCase().includes(search.toLowerCase()) ||
      (ex.tags && ex.tags.toLowerCase().includes(search.toLowerCase()));

    // Filtrage par tags
    const matchesTags = selectedTags.length === 0 || 
      (ex.tags && selectedTags.some(tag => ex.tags.includes(tag)));

    return matchesSearch && matchesTags;
  });
};

exports.getPublicExercices = async (req, res) => {
  try {
    const { search, tags } = req.query;
    const selectedTags = tags ? tags.split(',') : [];

    const exercices = await prisma.exerciceModele.findMany({
      where: { isPublic: true },
    });

    // Appliquer les filtres et le tri
    const filteredExercices = filterExercices(exercices, search, selectedTags);
    const sortedExercices = sortExercicesAlphabetically(filteredExercices);

    res.json(sortedExercices);
  } catch (err) {
    console.error("Erreur récupération exercices publics :", err);
    res.status(500).json({ error: "Erreur récupération exercices publics" });
  }
};

exports.getPrivateExercices = async (req, res) => {
  try {
    const firebaseUid = req.uid;
    const { search, tags } = req.query;
    const selectedTags = tags ? tags.split(',') : [];

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

    // Appliquer les filtres et le tri
    const filteredExercices = filterExercices(exercices, search, selectedTags);
    const sortedExercices = sortExercicesAlphabetically(filteredExercices);

    res.json(sortedExercices);
  } catch (err) {
    console.error("Erreur récupération exercices privés :", err);
    res.status(500).json({ error: "Erreur récupération exercices privés" });
  }
};

// NOUVELLE ROUTE : Récupérer tous les tags utilisés
exports.getAllTags = async (req, res) => {
  try {
    const firebaseUid = req.uid;
    const kine = await prisma.kine.findUnique({
      where: { uid: firebaseUid },
    });

    if (!kine) {
      return res.status(404).json({ error: "Kiné introuvable avec ce UID Firebase." });
    }

    // Récupérer tous les exercices (publics + privés du kiné)
    const exercices = await prisma.exerciceModele.findMany({
      where: {
        OR: [
          { isPublic: true },
          { kineId: kine.id }
        ]
      },
      select: { tags: true }
    });

    // Extraire tous les tags uniques
    const allTags = exercices
      .filter(ex => ex.tags)
      .flatMap(ex => ex.tags.split(',').map(tag => tag.trim()))
      .filter(tag => tag.length > 0);

    const uniqueTags = [...new Set(allTags)].sort();

    res.json(uniqueTags);
  } catch (err) {
    console.error("Erreur récupération tags :", err);
    res.status(500).json({ error: "Erreur récupération tags" });
  }
};

exports.createExercice = async (req, res) => {
  const { nom, description, tags } = req.body;

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
        tags: tags || null, // Stocker les tags sous forme de string séparée par virgules
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
  const { nom, description, tags } = req.body;

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
      data: { 
        nom, 
        description, 
        tags: tags || null 
      },
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