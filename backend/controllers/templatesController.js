const logger = require('../utils/logger');
const prismaService = require('../services/prismaService');

// 🔐 Toutes les routes supposent que req.uid est défini par le middleware authenticate

// Récupérer tous les templates (publics + privés du kiné)
exports.getAllTemplates = async (req, res) => {
  try {
    const firebaseUid = req.uid;
    const prisma = prismaService.getInstance();

    const kine = await prisma.kine.findUnique({
      where: { uid: firebaseUid },
    });

    if (!kine) {
      return res.status(404).json({ error: "Kiné introuvable avec ce UID Firebase." });
    }

    // Récupérer templates publics + privés du kiné avec exercices inclus
    const templates = await prisma.exerciceTemplate.findMany({
      where: {
        OR: [
          { isPublic: true },
          { kineId: kine.id }
        ]
      },
      include: {
        items: {
          include: {
            exerciceModele: {
              select: {
                id: true,
                nom: true,
                description: true,
                tags: true,
                gifUrl: true,
                isPublic: true
              }
            }
          },
          orderBy: {
            ordre: 'asc'
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json(templates);
  } catch (err) {
    logger.error("Erreur récupération templates :", err);
    res.status(500).json({ error: "Erreur récupération templates" });
  }
};

// Récupérer templates publics uniquement
exports.getPublicTemplates = async (req, res) => {
  try {
    const prisma = prismaService.getInstance();

    const templates = await prisma.exerciceTemplate.findMany({
      where: { isPublic: true },
      include: {
        items: {
          include: {
            exerciceModele: {
              select: {
                id: true,
                nom: true,
                description: true,
                tags: true,
                gifUrl: true,
                isPublic: true
              }
            }
          },
          orderBy: {
            ordre: 'asc'
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json(templates);
  } catch (err) {
    logger.error("Erreur récupération templates publics :", err);
    res.status(500).json({ error: "Erreur récupération templates publics" });
  }
};

// Récupérer templates privés du kiné uniquement
exports.getPrivateTemplates = async (req, res) => {
  try {
    const firebaseUid = req.uid;
    const prisma = prismaService.getInstance();

    const kine = await prisma.kine.findUnique({
      where: { uid: firebaseUid },
    });

    if (!kine) {
      return res.status(404).json({ error: "Kiné introuvable avec ce UID Firebase." });
    }

    const templates = await prisma.exerciceTemplate.findMany({
      where: {
        isPublic: false,
        kineId: kine.id
      },
      include: {
        items: {
          include: {
            exerciceModele: {
              select: {
                id: true,
                nom: true,
                description: true,
                tags: true,
                gifUrl: true,
                isPublic: true
              }
            }
          },
          orderBy: {
            ordre: 'asc'
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json(templates);
  } catch (err) {
    logger.error("Erreur récupération templates privés :", err);
    res.status(500).json({ error: "Erreur récupération templates privés" });
  }
};

// Récupérer un template spécifique avec ses exercices
exports.getTemplateById = async (req, res) => {
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

    const template = await prisma.exerciceTemplate.findUnique({
      where: { id: parseInt(id) },
      include: {
        items: {
          include: {
            exerciceModele: {
              select: {
                id: true,
                nom: true,
                description: true,
                tags: true,
                gifUrl: true,
                isPublic: true
              }
            }
          },
          orderBy: {
            ordre: 'asc'
          }
        }
      }
    });

    if (!template) {
      return res.status(404).json({ error: "Template introuvable" });
    }

    // Vérifier les permissions : public OU appartient au kiné
    if (!template.isPublic && template.kineId !== kine.id) {
      return res.status(403).json({ error: "Non autorisé à accéder à ce template" });
    }

    res.json(template);
  } catch (err) {
    logger.error("Erreur récupération template :", err);
    res.status(500).json({ error: "Erreur récupération template" });
  }
};

// Créer un nouveau template
exports.createTemplate = async (req, res) => {
  const { nom, description, exercises } = req.body;

  try {
    const firebaseUid = req.uid;
    const prisma = prismaService.getInstance();

    const kine = await prisma.kine.findUnique({
      where: { uid: firebaseUid },
    });

    if (!kine) {
      return res.status(404).json({ error: "Kiné introuvable avec ce UID Firebase." });
    }

    // Valider les données
    if (!nom || !exercises || exercises.length === 0) {
      return res.status(400).json({ error: "Nom et exercices requis" });
    }

    // Créer le template avec ses exercices en transaction
    const newTemplate = await prisma.exerciceTemplate.create({
      data: {
        nom,
        description: description || null,
        isPublic: false, // Toujours privé au départ
        kineId: kine.id,
        items: {
          create: exercises.map((ex, index) => ({
            exerciceModeleId: ex.exerciceId,
            ordre: index,
            series: ex.series || 3,
            repetitions: ex.repetitions || 10,
            tempsRepos: ex.tempsRepos || 30,
            instructions: ex.instructions || null
          }))
        }
      },
      include: {
        items: {
          include: {
            exerciceModele: {
              select: {
                id: true,
                nom: true,
                description: true,
                tags: true,
                gifUrl: true,
                isPublic: true
              }
            }
          },
          orderBy: {
            ordre: 'asc'
          }
        }
      }
    });

    logger.info(`Template créé: ${newTemplate.id} par kiné ${kine.id}`);
    res.status(201).json(newTemplate);
  } catch (err) {
    logger.error("Erreur création template :", err);
    res.status(500).json({ error: "Erreur création template" });
  }
};

// Modifier un template existant
exports.updateTemplate = async (req, res) => {
  const { id } = req.params;
  const { nom, description, exercises } = req.body;

  try {
    const firebaseUid = req.uid;
    const prisma = prismaService.getInstance();

    const kine = await prisma.kine.findUnique({
      where: { uid: firebaseUid },
    });

    if (!kine) {
      return res.status(404).json({ error: "Kiné introuvable avec ce UID Firebase." });
    }

    const template = await prisma.exerciceTemplate.findUnique({
      where: { id: parseInt(id) },
    });

    if (!template) {
      return res.status(404).json({ error: "Template introuvable" });
    }

    // Vérifier ownership et que ce n'est pas public
    if (template.kineId !== kine.id || template.isPublic) {
      return res.status(403).json({ error: "Non autorisé à modifier ce template" });
    }

    // Mettre à jour en transaction
    const updated = await prisma.$transaction(async (tx) => {
      // Supprimer les anciens items
      await tx.exerciceTemplateItem.deleteMany({
        where: { templateId: parseInt(id) }
      });

      // Mettre à jour le template avec les nouveaux items
      return await tx.exerciceTemplate.update({
        where: { id: parseInt(id) },
        data: {
          nom,
          description: description || null,
          items: {
            create: exercises.map((ex, index) => ({
              exerciceModeleId: ex.exerciceId,
              ordre: index,
              series: ex.series || 3,
              repetitions: ex.repetitions || 10,
              tempsRepos: ex.tempsRepos || 30,
              instructions: ex.instructions || null
            }))
          }
        },
        include: {
          items: {
            include: {
              exerciceModele: {
                select: {
                  id: true,
                  nom: true,
                  description: true,
                  tags: true,
                  gifUrl: true,
                  isPublic: true
                }
              }
            },
            orderBy: {
              ordre: 'asc'
            }
          }
        }
      });
    });

    logger.info(`Template modifié: ${id} par kiné ${kine.id}`);
    res.json(updated);
  } catch (err) {
    logger.error("Erreur modification template :", err);
    res.status(500).json({ error: "Erreur modification template" });
  }
};

// Supprimer un template
exports.deleteTemplate = async (req, res) => {
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

    const template = await prisma.exerciceTemplate.findUnique({
      where: { id: parseInt(id) },
    });

    if (!template) {
      return res.status(404).json({ error: "Template introuvable" });
    }

    // Vérifier ownership et que ce n'est pas public
    if (template.kineId !== kine.id || template.isPublic) {
      return res.status(403).json({ error: "Non autorisé à supprimer ce template" });
    }

    // Supprimer (cascade sur items)
    await prisma.exerciceTemplate.delete({
      where: { id: parseInt(id) }
    });

    logger.info(`Template supprimé: ${id} par kiné ${kine.id}`);
    res.status(204).send();
  } catch (err) {
    logger.error("Erreur suppression template :", err);
    res.status(500).json({ error: "Erreur suppression template" });
  }
};
