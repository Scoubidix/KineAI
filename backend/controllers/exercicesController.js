const logger = require('../utils/logger');
const prismaService = require('../services/prismaService');
const gcsStorageService = require('../services/gcsStorageService');

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

    // Enrichir avec URLs signées GCS (ou fallback Firebase pour migration)
    const enrichedExercices = await gcsStorageService.enrichExercicesWithSignedUrls(sortedExercices);

    res.json(enrichedExercices);
  } catch (err) {
    logger.error("Erreur récupération exercices publics :", err);
    res.status(500).json({ error: "Erreur récupération exercices publics" });
  }
};

// ADMIN : liste tous les exos publics enrichis (créateur + nombre de programmes)
exports.getAdminPublicExercices = async (req, res) => {
  try {
    const prisma = prismaService.getInstance();

    const exercices = await prisma.exerciceModele.findMany({
      where: { isPublic: true },
      include: { kine: { select: { firstName: true, lastName: true, email: true } } },
    });

    // Compter les usages en un seul groupBy (évite le N+1)
    const ids = exercices.map((e) => e.id);
    const counts = ids.length
      ? await prisma.exerciceProgramme.groupBy({
          by: ['exerciceModeleId'],
          where: { exerciceModeleId: { in: ids } },
          _count: { _all: true },
        })
      : [];
    const countMap = {};
    for (const c of counts) countMap[c.exerciceModeleId] = c._count._all;

    const withUsage = exercices.map((e) => ({ ...e, usageCount: countMap[e.id] || 0 }));
    const sorted = sortExercicesAlphabetically(withUsage);
    const enriched = await gcsStorageService.enrichExercicesWithSignedUrls(sorted);

    res.json(enriched);
  } catch (err) {
    logger.error('Erreur récupération exercices publics (admin) :', err);
    res.status(500).json({ error: 'Erreur récupération exercices publics' });
  }
};

// ADMIN : promouvoir un de SES exos privés en public
exports.publishExercice = async (req, res) => {
  const { id } = req.params;
  try {
    const prisma = prismaService.getInstance();
    const exercice = await prisma.exerciceModele.findUnique({ where: { id: parseInt(id) } });

    if (!exercice) {
      return res.status(404).json({ error: 'Exercice introuvable' });
    }
    if (exercice.kineId !== req.kineId) {
      return res.status(403).json({ error: 'Seul le créateur peut rendre cet exercice public' });
    }
    if (exercice.isPublic) {
      return res.status(403).json({ error: 'Cet exercice est déjà public' });
    }

    const updated = await prisma.exerciceModele.update({
      where: { id: parseInt(id) },
      data: { isPublic: true },
    });
    res.json(updated);
  } catch (err) {
    logger.error('Erreur publication exercice :', err);
    res.status(500).json({ error: 'Erreur publication exercice' });
  }
};

// ADMIN : dé-publier n'importe quel exo public (le repasse en privé)
exports.unpublishExercice = async (req, res) => {
  const { id } = req.params;
  try {
    const prisma = prismaService.getInstance();
    const exercice = await prisma.exerciceModele.findUnique({ where: { id: parseInt(id) } });

    if (!exercice || !exercice.isPublic) {
      return res.status(404).json({ error: 'Exercice public introuvable' });
    }

    const updated = await prisma.exerciceModele.update({
      where: { id: parseInt(id) },
      data: { isPublic: false },
    });
    res.json(updated);
  } catch (err) {
    logger.error('Erreur dé-publication exercice :', err);
    res.status(500).json({ error: 'Erreur dé-publication exercice' });
  }
};

// ADMIN : éditer n'importe quel exo public
exports.adminUpdateExercice = async (req, res) => {
  const { id } = req.params;
  const { nom, description, tags, gifPath } = req.body;
  try {
    const prisma = prismaService.getInstance();
    const exercice = await prisma.exerciceModele.findUnique({ where: { id: parseInt(id) } });

    if (!exercice || !exercice.isPublic) {
      return res.status(404).json({ error: 'Exercice public introuvable' });
    }

    // Si un nouveau gifPath remplace l'ancien, supprimer l'ancien GIF de GCS
    if (gifPath !== undefined && exercice.gifPath && gifPath !== exercice.gifPath) {
      try {
        await gcsStorageService.deleteGif(exercice.gifPath);
        logger.info(`Ancien GIF supprimé de GCS: ${exercice.gifPath}`);
      } catch (error) {
        logger.warn('Erreur suppression ancien GIF:', error);
      }
    }

    const updated = await prisma.exerciceModele.update({
      where: { id: parseInt(id) },
      data: {
        nom: nom !== undefined ? nom : exercice.nom,
        description: description !== undefined ? description : exercice.description,
        tags: tags !== undefined ? (tags || null) : exercice.tags,
        gifPath: gifPath !== undefined ? (gifPath || null) : exercice.gifPath,
      },
    });

    if (updated.gifPath) {
      updated.gifUrl = await gcsStorageService.generateSignedUrl(updated.gifPath);
    }
    res.json(updated);
  } catch (err) {
    logger.error('Erreur édition exercice public :', err);
    res.status(500).json({ error: 'Erreur édition exercice' });
  }
};

// ADMIN : supprimer un exo public (refus si utilisé dans un programme)
exports.adminDeleteExercice = async (req, res) => {
  const { id } = req.params;
  try {
    const prisma = prismaService.getInstance();
    const exercice = await prisma.exerciceModele.findUnique({ where: { id: parseInt(id) } });

    if (!exercice || !exercice.isPublic) {
      return res.status(404).json({ error: 'Exercice public introuvable' });
    }

    const exercicesEnCours = await prisma.exerciceProgramme.findMany({
      where: { exerciceModeleId: parseInt(id) },
      include: {
        programme: { select: { titre: true, patient: { select: { firstName: true, lastName: true } } } },
      },
    });

    if (exercicesEnCours.length > 0) {
      return res.status(400).json({
        error: 'Impossible de supprimer cet exercice',
        message: 'Cet exercice est utilisé dans des programmes actifs',
        programmes: exercicesEnCours.map((ex) => ({
          programme: ex.programme.titre,
          patient: `${ex.programme.patient.firstName} ${ex.programme.patient.lastName}`,
        })),
      });
    }

    if (exercice.gifPath) {
      try {
        await gcsStorageService.deleteGif(exercice.gifPath);
      } catch (error) {
        logger.warn('Erreur suppression GIF GCS:', error);
      }
    }

    await prisma.exerciceModele.delete({ where: { id: parseInt(id) } });
    res.status(204).send();
  } catch (err) {
    logger.error('Erreur suppression exercice public :', err);
    res.status(500).json({ error: 'Erreur suppression exercice' });
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

    // Enrichir avec URLs signées GCS (ou fallback Firebase pour migration)
    const enrichedExercices = await gcsStorageService.enrichExercicesWithSignedUrls(sortedExercices);

    res.json(enrichedExercices);
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
  const { nom, description, tags, gifPath } = req.body;

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
        tags: tags || null,
        gifPath: gifPath || null, // Chemin GCS du GIF (ex: "exercices/123_demo.gif")
        isPublic: false,
        kineId: kine.id,
      },
    });

    // Générer URL signée si gifPath existe
    if (newExercice.gifPath) {
      newExercice.gifUrl = await gcsStorageService.generateSignedUrl(newExercice.gifPath);
    }

    res.status(201).json(newExercice);
  } catch (err) {
    logger.error("Erreur création exercice :", err);
    res.status(500).json({ error: "Erreur création exercice" });
  }
};

exports.updateExercice = async (req, res) => {
  const { id } = req.params;
  const { nom, description, tags, gifPath } = req.body;

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

    // Si un nouveau gifPath est fourni et différent de l'ancien, supprimer l'ancien GIF de GCS
    if (gifPath !== undefined && exercice.gifPath && gifPath !== exercice.gifPath) {
      try {
        await gcsStorageService.deleteGif(exercice.gifPath);
        logger.info(`Ancien GIF supprimé de GCS: ${exercice.gifPath}`);
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
        gifPath: gifPath !== undefined ? (gifPath || null) : exercice.gifPath
      },
    });

    // Générer URL signée pour la réponse
    if (updated.gifPath) {
      updated.gifUrl = await gcsStorageService.generateSignedUrl(updated.gifPath);
    }

    res.json(updated);
  } catch (err) {
    logger.error("Erreur modification exercice :", err);
    res.status(500).json({ error: "Erreur modification exercice" });
  }
};

exports.deleteExercice = async (req, res) => {
  const { id } = req.params;

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

    // Supprimer le GIF associé de GCS s'il existe
    if (exercice.gifPath) {
      try {
        await gcsStorageService.deleteGif(exercice.gifPath);
        logger.info(`GIF supprimé de GCS: ${exercice.gifPath}`);
      } catch (error) {
        logger.warn('Erreur lors de la suppression du GIF de GCS:', error);
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

    // Upload le GIF sur GCS (retourne le path, pas l'URL)
    const gifPath = await gcsStorageService.uploadGif(gifBuffer, gifFileName);

    // Générer une URL signée pour l'affichage immédiat
    const gifUrl = await gcsStorageService.generateSignedUrl(gifPath);

    // Nettoyer le fichier vidéo temporaire
    await fs.unlink(req.file.path).catch(err =>
      logger.warn('Erreur lors de la suppression de la vidéo temporaire:', err)
    );

    logger.info(`Upload GCS complet. Path: ${gifPath}`);

    res.status(200).json({
      success: true,
      gifPath,     // Chemin GCS à stocker en DB
      gifUrl,      // URL signée temporaire pour affichage immédiat
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