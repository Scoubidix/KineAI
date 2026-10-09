const logger = require('../utils/logger');
const prismaService = require('../services/prismaService');
const gcsStorageService = require('../services/gcsStorageService');

/**
 * Applique les règles de cohabitation GIF / vidéo à une mise à jour.
 *
 * La vidéo prime : dès qu'un `videoPath` est présent, le GIF legacy disparaît —
 * sans ça l'état reste ambigu et le compteur de convergence ne descend jamais.
 * Le front ne pose plus jamais de `gifPath` : cette colonne ne peut que
 * disparaître.
 *
 * @param {object|null} existing - L'exercice en base, ou null à la création
 * @param {object} body - Corps de requête déjà validé par Zod
 * @returns {{videoPath: string|null, posterPath: string|null, gifPath: string|null, orphans: string[]}}
 */
function resolveMediaPaths(existing, body) {
  const pick = (key) => (body[key] !== undefined ? (body[key] || null) : (existing?.[key] ?? null));

  const videoPath = pick('videoPath');
  const posterPath = pick('posterPath');
  const gifPath = videoPath ? null : pick('gifPath');

  const kept = [videoPath, posterPath, gifPath];
  const orphans = [existing?.videoPath, existing?.posterPath, existing?.gifPath]
    .filter((p) => p && !kept.includes(p));

  return { videoPath, posterPath, gifPath, orphans };
}

/**
 * Supprime de GCS les fichiers que plus aucune colonne ne référence.
 * Best-effort : le nouveau fichier est déjà déposé, une suppression ratée laisse
 * un orphelin sur le bucket mais ne doit jamais faire échouer la mise à jour.
 *
 * @param {string[]} orphans
 * @param {number|null} exceptExerciceId - Exercice à exclure du comptage de
 *   références. À la mise à jour, la ligne porte déjà les NOUVEAUX chemins au
 *   moment de l'appel : on l'exclut par prudence (elle ne référence de toute
 *   façon plus les chemins orphelins passés ici). À la suppression, la ligne
 *   est effacée ou vidée AVANT cet appel (removeExercice) : elle ne peut plus
 *   s'auto-référencer, ce paramètre reste donc à `null`.
 */
async function deleteOrphanMedia(orphans, exceptExerciceId = null) {
  const prisma = prismaService.getInstance();
  for (const mediaPath of orphans) {
    // Un chemin arrive du corps de la requête : rien ne garantit qu'il
    // appartienne à l'appelant. Sans cette vérification, un kiné pourrait
    // poser le chemin d'un exercice d'autrui sur le sien, le supprimer, et
    // effacer définitivement le fichier — la source ayant déjà disparu.
    const stillReferenced = await prisma.exerciceModele.count({
      where: {
        ...(exceptExerciceId ? { id: { not: exceptExerciceId } } : {}),
        OR: [{ videoPath: mediaPath }, { posterPath: mediaPath }, { gifPath: mediaPath }],
      },
    });
    if (stillReferenced > 0) {
      logger.warn('Média encore référencé par un autre exercice, suppression annulée:', mediaPath);
      continue;
    }
    try {
      await gcsStorageService.deleteExerciceMedia(mediaPath);
    } catch (error) {
      logger.warn("Erreur suppression d'un média d'exercice orphelin:", error);
    }
  }
}

// Programme « en cours » : même règle que l'accès patient (mediaController).
// Les programmes archivés ou supprimés relèvent de l'historique.
const PROGRAMME_EN_COURS = { isActive: true, isArchived: false, patient: { isActive: true } };

/**
 * Ce que la suppression d'un exercice entraînerait : les programmes en cours
 * qui la bloquent, et le nombre de templates dont il sera retiré.
 *
 * @param {object} db - Client Prisma ou transaction
 * @param {number} exerciceId
 */
async function getDeletionImpact(db, exerciceId) {
  const [programmes, templatesCount] = await Promise.all([
    db.programme.findMany({
      where: { ...PROGRAMME_EN_COURS, exercices: { some: { exerciceModeleId: exerciceId } } },
      select: { titre: true, patient: { select: { firstName: true, lastName: true } } },
    }),
    db.exerciceTemplate.count({
      where: { items: { some: { exerciceModeleId: exerciceId } } },
    }),
  ]);
  return {
    programmes: programmes.map((p) => ({
      programme: p.titre,
      patient: `${p.patient.firstName} ${p.patient.lastName}`,
    })),
    templatesCount,
  };
}

/**
 * Retire un exercice de la bibliothèque. Refusé tant qu'un programme en cours
 * l'utilise. Sinon il quitte les templates, puis :
 * - jamais utilisé dans un programme → suppression définitive ;
 * - présent dans l'historique (programmes archivés ou supprimés) → archivé :
 *   la ligne reste pour que la prescription demeure lisible, les médias
 *   partent (la démo n'est pas du dossier patient). La ligne est effacée plus
 *   tard avec la purge des programmes archivés (utils/chatCleanup.js).
 *
 * @returns {Promise<object[]>} Les programmes en cours qui bloquent (vide si retiré)
 */
async function removeExercice(exercice) {
  const prisma = prismaService.getInstance();
  const id = exercice.id;

  const programmesEnCours = await prisma.$transaction(async (tx) => {
    const { programmes } = await getDeletionImpact(tx, id);
    if (programmes.length > 0) return programmes;

    await tx.exerciceTemplateItem.deleteMany({ where: { exerciceModeleId: id } });
    const historique = await tx.exerciceProgramme.count({ where: { exerciceModeleId: id } });
    if (historique === 0) {
      await tx.exerciceModele.delete({ where: { id } });
    } else {
      await tx.exerciceModele.update({
        where: { id },
        data: {
          isActive: false,
          deletedAt: new Date(),
          videoPath: null,
          posterPath: null,
          gifPath: null,
          gifUrl: null,
        },
      });
    }
    return [];
  });

  if (programmesEnCours.length > 0) return programmesEnCours;

  // Après l'écriture : la ligne (effacée ou vidée) ne référence plus ses
  // propres chemins, le comptage de deleteOrphanMedia ne la voit donc pas. Si
  // l'écriture échoue, aucun média n'est perdu.
  await deleteOrphanMedia(
    [exercice.videoPath, exercice.posterPath, exercice.gifPath].filter(Boolean)
  );
  return [];
}

function sendExerciceInUse(res, programmes) {
  return res.status(409).json({
    success: false,
    error: 'Cet exercice est utilisé dans un programme en cours',
    code: 'EXERCICE_IN_USE',
    programmes,
  });
}

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
      where: { isPublic: true, isActive: true },
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
      where: { isPublic: true, isActive: true },
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

// ADMIN : nombre d'exercices PRIVÉS encore en GIF (aucune vidéo).
// Les exercices publics sont maîtrisés en interne, ils n'ont pas besoin d'être
// comptés. Donnée strictement agrégée — un nombre — donc aucune donnée
// personnelle exposée, même en portant sur les exercices d'autres kinés.
// C'est ce compteur qui rend la fin de la transition constatable plutôt
// qu'espérée, et qui déclenchera la phase de sortie.
exports.getLegacyGifCount = async (req, res) => {
  try {
    const prisma = prismaService.getInstance();
    const count = await prisma.exerciceModele.count({
      where: { isPublic: false, gifPath: { not: null }, videoPath: null },
    });
    res.json({ count });
  } catch (err) {
    logger.error('Erreur comptage des exercices encore en GIF :', err);
    res.status(500).json({ error: 'Erreur comptage des exercices encore en GIF' });
  }
};

// ADMIN : promouvoir un de SES exos privés en public
exports.publishExercice = async (req, res) => {
  const { id } = req.params;
  try {
    const prisma = prismaService.getInstance();
    const exercice = await prisma.exerciceModele.findUnique({ where: { id: parseInt(id) } });

    if (!exercice || !exercice.isActive) {
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

    if (!exercice || !exercice.isPublic || !exercice.isActive) {
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
// ADMIN : régénère la miniature d'un exercice public à un instant choisi dans
// sa vidéo. La source d'origine étant supprimée après conversion, la seule
// vidéo disponible est celle du bucket : on la rapatrie le temps d'extraire
// une image, avec la MÊME chaîne de filtres que le poster automatique — sinon
// une miniature choisie à la main sortirait avec un rendu différent.
//
// N'écrit RIEN en base : elle renvoie le chemin, et c'est l'enregistrement du
// formulaire qui le persiste. `resolveMediaPaths` traite alors l'ancien poster
// comme un orphelin et `deleteOrphanMedia` l'efface — exactement le chemin
// déjà emprunté par le remplacement d'une vidéo, aucune règle en double.
exports.adminRegeneratePoster = async (req, res) => {
  const videoConversionService = require('../services/videoConversionService');
  const fs = require('fs').promises;
  const os = require('os');
  const path = require('path');

  const { id } = req.params;
  const { atSeconds } = req.body;

  if (!Number.isFinite(atSeconds) || atSeconds < 0) {
    return res.status(400).json({ error: 'Instant invalide' });
  }

  let localVideo = null;
  try {
    const prisma = prismaService.getInstance();
    const exercice = await prisma.exerciceModele.findUnique({ where: { id: parseInt(id) } });

    if (!exercice || !exercice.isPublic || !exercice.isActive) {
      return res.status(404).json({ error: 'Exercice public introuvable' });
    }
    if (!exercice.videoPath) {
      return res.status(400).json({ error: "Cet exercice n'a pas de vidéo : impossible d'en extraire une image." });
    }

    const baseName = `exercice_${Date.now()}`;
    localVideo = path.join(os.tmpdir(), `${baseName}_source.mp4`);
    await gcsStorageService.downloadExerciceMedia(exercice.videoPath, localVideo);

    const probe = await videoConversionService.probeVideo(localVideo);
    const poster = await videoConversionService.extractPoster(localVideo, baseName, probe, atSeconds);
    const posterPath = await gcsStorageService.uploadExerciceFile(poster.buffer, poster.fileName, 'image/jpeg');
    const posterUrl = await gcsStorageService.generateSignedUrl(posterPath);

    logger.info(`Miniature régénérée à ${atSeconds}s pour l'exercice ${id}: ${posterPath}`);
    res.json({ posterPath, posterUrl });
  } catch (err) {
    logger.error('Erreur régénération de la miniature :', err);
    res.status(500).json({ error: 'Erreur lors de la génération de la miniature' });
  } finally {
    if (localVideo) {
      await fs.unlink(localVideo).catch((e) =>
        logger.warn('Erreur suppression de la vidéo temporaire :', e)
      );
    }
  }
};

exports.adminUpdateExercice = async (req, res) => {
  const { id } = req.params;
  const { nom, description, tags } = req.body;
  try {
    const prisma = prismaService.getInstance();
    const exercice = await prisma.exerciceModele.findUnique({ where: { id: parseInt(id) } });

    if (!exercice || !exercice.isPublic || !exercice.isActive) {
      return res.status(404).json({ error: 'Exercice public introuvable' });
    }

    const media = resolveMediaPaths(exercice, req.body);

    const updated = await prisma.exerciceModele.update({
      where: { id: parseInt(id) },
      data: {
        nom: nom !== undefined ? nom : exercice.nom,
        description: description !== undefined ? description : exercice.description,
        tags: tags !== undefined ? (tags || null) : exercice.tags,
        gifPath: media.gifPath,
        videoPath: media.videoPath,
        posterPath: media.posterPath,
      },
    });

    // La ligne porte déjà les NOUVEAUX chemins : on l'exclut du comptage pour
    // ne jamais se bloquer soi-même sur un ancien chemin qu'on ne référence
    // plus.
    await deleteOrphanMedia(media.orphans, exercice.id);

    const [enriched] = await gcsStorageService.enrichExercicesWithSignedUrls([updated]);
    res.json(enriched);
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

    if (!exercice || !exercice.isPublic || !exercice.isActive) {
      return res.status(404).json({ error: 'Exercice public introuvable' });
    }

    const programmesEnCours = await removeExercice(exercice);
    if (programmesEnCours.length > 0) return sendExerciceInUse(res, programmesEnCours);

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
        isActive: true,
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
        isActive: true,
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
  const { nom, description, tags } = req.body;

  try {
    const firebaseUid = req.uid;
    const prisma = prismaService.getInstance();

    const kine = await prisma.kine.findUnique({
      where: { uid: firebaseUid },
    });

    if (!kine) {
      return res.status(404).json({ error: "Kiné introuvable avec ce UID Firebase." });
    }

    const media = resolveMediaPaths(null, req.body);

    const newExercice = await prisma.exerciceModele.create({
      data: {
        nom,
        description,
        tags: tags || null,
        gifPath: media.gifPath,
        videoPath: media.videoPath,
        posterPath: media.posterPath,
        isPublic: false,
        kineId: kine.id,
      },
    });

    const [enriched] = await gcsStorageService.enrichExercicesWithSignedUrls([newExercice]);
    res.status(201).json(enriched);
  } catch (err) {
    logger.error("Erreur création exercice :", err);
    res.status(500).json({ error: "Erreur création exercice" });
  }
};

exports.updateExercice = async (req, res) => {
  const { id } = req.params;
  const { nom, description, tags } = req.body;

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

    if (!exercice || exercice.kineId !== kine.id || exercice.isPublic || !exercice.isActive) {
      return res.status(403).json({ error: "Non autorisé à modifier cet exercice" });
    }

    const media = resolveMediaPaths(exercice, req.body);

    const updated = await prisma.exerciceModele.update({
      where: { id: parseInt(id) },
      data: {
        nom,
        description,
        tags: tags || null,
        gifPath: media.gifPath,
        videoPath: media.videoPath,
        posterPath: media.posterPath,
      },
    });

    // Après l'écriture : la ligne porte déjà les nouveaux chemins, on l'exclut
    // du comptage pour ne jamais se bloquer soi-même sur un ancien chemin
    // qu'on ne référence plus.
    await deleteOrphanMedia(media.orphans, exercice.id);

    const [enriched] = await gcsStorageService.enrichExercicesWithSignedUrls([updated]);
    res.json(enriched);
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

    if (!exercice || exercice.kineId !== kine.id || exercice.isPublic || !exercice.isActive) {
      return res.status(403).json({ error: "Non autorisé à supprimer cet exercice" });
    }

    const programmesEnCours = await removeExercice(exercice);
    if (programmesEnCours.length > 0) return sendExerciceInUse(res, programmesEnCours);

    res.status(204).send();
  } catch (err) {
    logger.error("Erreur suppression exercice :", err);
    res.status(500).json({ error: "Erreur suppression exercice" });
  }
};

// Aperçu avant suppression, pour la boîte de confirmation : programmes en
// cours qui bloquent, templates dont l'exercice sera retiré.
exports.getDeletionImpact = async (req, res) => {
  const { id } = req.params;
  try {
    const prisma = prismaService.getInstance();
    const kine = await prisma.kine.findUnique({ where: { uid: req.uid } });
    if (!kine) {
      return res.status(404).json({ error: "Kiné introuvable avec ce UID Firebase." });
    }

    const exercice = await prisma.exerciceModele.findUnique({ where: { id: parseInt(id) } });

    if (!exercice || exercice.kineId !== kine.id || exercice.isPublic || !exercice.isActive) {
      return res.status(403).json({ error: "Non autorisé à supprimer cet exercice" });
    }

    res.json(await getDeletionImpact(prisma, exercice.id));
  } catch (err) {
    logger.error("Erreur aperçu suppression exercice :", err);
    res.status(500).json({ error: "Erreur aperçu suppression exercice" });
  }
};

// ADMIN : même aperçu pour un exo public
exports.adminGetDeletionImpact = async (req, res) => {
  const { id } = req.params;
  try {
    const prisma = prismaService.getInstance();
    const exercice = await prisma.exerciceModele.findUnique({ where: { id: parseInt(id) } });

    if (!exercice || !exercice.isPublic || !exercice.isActive) {
      return res.status(404).json({ error: 'Exercice public introuvable' });
    }

    res.json(await getDeletionImpact(prisma, exercice.id));
  } catch (err) {
    logger.error('Erreur aperçu suppression exercice public :', err);
    res.status(500).json({ error: 'Erreur aperçu suppression exercice' });
  }
};

exports.uploadExerciceMedia = async (req, res) => {
  const videoConversionService = require('../services/videoConversionService');
  const fs = require('fs').promises;

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier vidéo fourni' });
    }

    const validation = await videoConversionService.validateVideoFile(req.file);
    if (!validation.valid) {
      await fs.unlink(req.file.path).catch((err) =>
        logger.warn('Erreur lors de la suppression du fichier temporaire:', err)
      );
      return res.status(400).json({ error: validation.error });
    }

    logger.info(`Upload vidéo reçu: ${req.file.originalname} (${(req.file.size / 1024 / 1024).toFixed(2)} MB)`);

    // Vidéo et poster partagent le même préfixe : la paire reste identifiable
    // sur le bucket.
    const baseName = `exercice_${Date.now()}`;
    const video = await videoConversionService.transcodeToMp4(req.file.path, baseName, validation.probe);
    const poster = await videoConversionService.extractPoster(req.file.path, baseName, validation.probe);

    const [videoPath, posterPath] = await Promise.all([
      gcsStorageService.uploadExerciceFile(video.buffer, video.fileName, 'video/mp4'),
      gcsStorageService.uploadExerciceFile(poster.buffer, poster.fileName, 'image/jpeg'),
    ]);

    const [videoUrl, posterUrl] = await Promise.all([
      gcsStorageService.generateSignedUrl(videoPath),
      gcsStorageService.generateSignedUrl(posterPath),
    ]);

    await fs.unlink(req.file.path).catch((err) =>
      logger.warn('Erreur lors de la suppression de la vidéo temporaire:', err)
    );

    logger.info(`Upload GCS complet. Vidéo: ${videoPath}, poster: ${posterPath}`);

    res.status(200).json({
      success: true,
      videoPath,    // à stocker en DB
      posterPath,   // à stocker en DB
      videoUrl,     // URL signée temporaire pour l'aperçu immédiat
      posterUrl,
      // Dimensions de sortie : le front s'en sert pour signaler un cadrage
      // vertical avant validation, sans bloquer le kiné.
      width: video.width,
      height: video.height,
      sizeInMB: video.sizeInMB,
    });
  } catch (err) {
    logger.error("Erreur lors de l'upload et conversion vidéo:", err);

    if (req.file && req.file.path) {
      await fs.unlink(req.file.path).catch((e) =>
        logger.warn('Erreur lors de la suppression du fichier temporaire:', e)
      );
    }

    res.status(500).json({
      error: 'Erreur lors de la conversion de la vidéo',
      details: err.message,
    });
  }
};