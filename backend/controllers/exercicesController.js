const logger = require('../utils/logger');
const prismaService = require('../services/prismaService');

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

    // Filtrage par tags (intersection AND - tous les tags doivent être présents)
    const matchesTags = selectedTags.length === 0 ||
      (ex.tags && selectedTags.every(tag => ex.tags.includes(tag)));

    return matchesSearch && matchesTags;
  });
};

exports.getPublicExercices = async (req, res) => {
  try {
    const { search, tags } = req.query;
    const selectedTags = tags ? tags.split(',') : [];
    const prisma = prismaService.getInstance();

    const exercices = await prisma.exerciceModele.findMany({
      where: { isPublic: true },
    });

    // Appliquer les filtres et le tri
    const filteredExercices = filterExercices(exercices, search, selectedTags);
    const sortedExercices = sortExercicesAlphabetically(filteredExercices);

    res.json(sortedExercices);
  } catch (err) {
    logger.error("Erreur récupération exercices publics :", err);
    res.status(500).json({ error: "Erreur récupération exercices publics" });
  }
};

exports.getPrivateExercices = async (req, res) => {
  try {
    const firebaseUid = req.uid;
    const { search, tags } = req.query;
    const selectedTags = tags ? tags.split(',') : [];
    const prisma = prismaService.getInstance();

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
    logger.error("Erreur récupération exercices privés :", err);
    res.status(500).json({ error: "Erreur récupération exercices privés" });
  }
};

// NOUVELLE ROUTE : Récupérer tous les tags utilisés
exports.getAllTags = async (req, res) => {
  try {
    const firebaseUid = req.uid;
    const prisma = prismaService.getInstance();
    
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
    logger.error("Erreur récupération tags :", err);
    res.status(500).json({ error: "Erreur récupération tags" });
  }
};

exports.createExercice = async (req, res) => {
  const { nom, description, tags, gifUrl } = req.body;

  try {
    const firebaseUid = req.uid;
    const prisma = prismaService.getInstance();

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
        gifUrl: gifUrl || null, // URL du GIF de démonstration
        isPublic: false,
        kineId: kine.id,
      },
    });

    res.status(201).json(newExercice);
  } catch (err) {
    logger.error("Erreur création exercice :", err);
    res.status(500).json({ error: "Erreur création exercice" });
  }
};

exports.updateExercice = async (req, res) => {
  const { id } = req.params;
  const { nom, description, tags, gifUrl } = req.body;
  const firebaseStorageService = require('../services/firebaseStorageService');

  try {
    const firebaseUid = req.uid;
    const prisma = prismaService.getInstance();

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

    // Si un nouveau gifUrl est fourni et différent de l'ancien, supprimer l'ancien GIF
    if (gifUrl !== undefined && exercice.gifUrl && gifUrl !== exercice.gifUrl) {
      try {
        await firebaseStorageService.deleteGif(exercice.gifUrl);
        logger.info(`Ancien GIF supprimé: ${exercice.gifUrl}`);
      } catch (error) {
        logger.warn('Erreur lors de la suppression de l\'ancien GIF:', error);
        // On continue quand même l'update
      }
    }

    const updated = await prisma.exerciceModele.update({
      where: { id: parseInt(id) },
      data: {
        nom,
        description,
        tags: tags || null,
        gifUrl: gifUrl !== undefined ? (gifUrl || null) : exercice.gifUrl
      },
    });

    res.json(updated);
  } catch (err) {
    logger.error("Erreur modification exercice :", err);
    res.status(500).json({ error: "Erreur modification exercice" });
  }
};

exports.deleteExercice = async (req, res) => {
  const { id } = req.params;
  const firebaseStorageService = require('../services/firebaseStorageService');

  try {
    const firebaseUid = req.uid;
    const prisma = prismaService.getInstance();

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

    // Vérifier si l'exercice est utilisé dans des programmes
    const exercicesEnCours = await prisma.exerciceProgramme.findMany({
      where: { exerciceModeleId: parseInt(id) },
      include: {
        programme: {
          select: { titre: true, patient: { select: { firstName: true, lastName: true } } }
        }
      }
    });

    if (exercicesEnCours.length > 0) {
      return res.status(400).json({
        error: "Impossible de supprimer cet exercice",
        message: "Cet exercice est utilisé dans des programmes actifs",
        programmes: exercicesEnCours.map(ex => ({
          programme: ex.programme.titre,
          patient: `${ex.programme.patient.firstName} ${ex.programme.patient.lastName}`
        }))
      });
    }

    // Supprimer le GIF associé de Firebase Storage s'il existe
    if (exercice.gifUrl) {
      try {
        await firebaseStorageService.deleteGif(exercice.gifUrl);
        logger.info(`GIF supprimé de Firebase Storage: ${exercice.gifUrl}`);
      } catch (error) {
        logger.warn('Erreur lors de la suppression du GIF de Firebase Storage:', error);
        // On continue quand même la suppression de l'exercice
      }
    }

    await prisma.exerciceModele.delete({
      where: { id: parseInt(id) },
    });

    res.status(204).send();
  } catch (err) {
    logger.error("Erreur suppression exercice :", err);
    res.status(500).json({ error: "Erreur suppression exercice" });
  }
};

exports.uploadVideoAndConvert = async (req, res) => {
  const videoConversionService = require('../services/videoConversionService');
  const firebaseStorageService = require('../services/firebaseStorageService');
  const fs = require('fs').promises;

  try {
    // Vérifier qu'un fichier a été uploadé
    if (!req.file) {
      return res.status(400).json({ error: "Aucun fichier vidéo fourni" });
    }

    // Valider le fichier vidéo
    const validation = await videoConversionService.validateVideoFile(req.file, 30);
    if (!validation.valid) {
      // Nettoyer le fichier uploadé
      await fs.unlink(req.file.path).catch(err =>
        logger.warn('Erreur lors de la suppression du fichier temporaire:', err)
      );
      return res.status(400).json({ error: validation.error });
    }

    logger.info(`Upload vidéo reçu: ${req.file.originalname} (${(req.file.size / 1024 / 1024).toFixed(2)} MB)`);

    // Convertir la vidéo en GIF
    const { buffer: gifBuffer, fileName: gifFileName, sizeInMB } =
      await videoConversionService.convertVideoToGif(
        req.file.path,
        `exercice_${Date.now()}`
      );

    logger.info(`GIF généré: ${gifFileName} (${sizeInMB} MB)`);

    // Upload le GIF sur Firebase Storage
    const gifUrl = await firebaseStorageService.uploadGif(gifBuffer, gifFileName);

    // Nettoyer le fichier vidéo temporaire
    await fs.unlink(req.file.path).catch(err =>
      logger.warn('Erreur lors de la suppression de la vidéo temporaire:', err)
    );

    logger.info(`Upload complet. URL du GIF: ${gifUrl}`);

    res.status(200).json({
      success: true,
      gifUrl,
      fileName: gifFileName,
      sizeInMB
    });

  } catch (err) {
    logger.error("Erreur lors de l'upload et conversion vidéo:", err);

    // Nettoyer le fichier temporaire en cas d'erreur
    if (req.file && req.file.path) {
      await fs.unlink(req.file.path).catch(err =>
        logger.warn('Erreur lors de la suppression du fichier temporaire:', err)
      );
    }

    res.status(500).json({
      error: "Erreur lors de la conversion de la vidéo",
      details: err.message
    });
  }
};