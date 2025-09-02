// routes/programmeAdmin.js
const logger = require('../utils/logger');
const express = require('express');
const router = express.Router();
const prismaService = require('../services/prismaService');
const { 
  archiveProgram, 
  deleteProgramAndChats,
  archiveFinishedProgramsTask,
  cleanupOldArchivedProgramsTask 
} = require('../services/chatService');

/**
 * POST /programmes/:id/archive
 * Archiver manuellement un programme
 */
router.post('/:id/archive', async (req, res) => {
  try {
    const programmeId = parseInt(req.params.id);
    const prisma = prismaService.getInstance();
    
    // Vérifier que le programme existe
    const programme = await prisma.programme.findUnique({
      where: { id: programmeId },
      include: {
        patient: { select: { firstName: true, lastName: true } },
        _count: { select: { chatSessions: true } }
      }
    });

    if (!programme) {
      return res.status(404).json({
        success: false,
        error: 'Programme non trouvé'
      });
    }

    if (programme.isArchived) {
      return res.status(400).json({
        success: false,
        error: 'Ce programme est déjà archivé'
      });
    }

    // Archiver le programme
    const archivedProgram = await prisma.programme.update({
      where: { id: programmeId },
      data: {
        isArchived: true,
        archivedAt: new Date()
      }
    });

    res.json({
      success: true,
      message: `Programme "${programme.titre}" archivé avec succès`,
      programme: {
        id: archivedProgram.id,
        titre: archivedProgram.titre,
        patient: `${programme.patient.firstName} ${programme.patient.lastName}`,
        archivedAt: archivedProgram.archivedAt,
        chatMessagesCount: programme._count.chatSessions
      }
    });

  } catch (error) {
    logger.error('Erreur archivage programme:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de l\'archivage du programme',
      details: error.message
    });
  }
});

/**
 * DELETE /programmes/:id
 * Supprimer définitivement un programme et ses conversations
 */
router.delete('/:id', async (req, res) => {
  try {
    const programmeId = parseInt(req.params.id);
    const prisma = prismaService.getInstance();
    
    // Vérifier que le programme existe
    const programme = await prisma.programme.findUnique({
      where: { id: programmeId },
      include: {
        patient: { select: { firstName: true, lastName: true } },
        _count: { select: { chatSessions: true } }
      }
    });

    if (!programme) {
      return res.status(404).json({
        success: false,
        error: 'Programme non trouvé'
      });
    }

    const chatCount = programme._count.chatSessions;
    const patientName = `${programme.patient.firstName} ${programme.patient.lastName}`;

    // Supprimer le programme (cascade supprimera les chats)
    await prisma.programme.delete({
      where: { id: programmeId }
    });

    res.json({
      success: true,
      message: `Programme "${programme.titre}" supprimé définitivement`,
      details: {
        programmeTitle: programme.titre,
        patient: patientName,
        chatMessagesDeleted: chatCount,
        deletedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('Erreur suppression programme:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la suppression du programme',
      details: error.message
    });
  }
});

/**
 * GET /programmes/archived
 * Lister tous les programmes archivés
 */
router.get('/archived', async (req, res) => {
  try {
    const prisma = prismaService.getInstance();
    
    const archivedPrograms = await prisma.programme.findMany({
      where: { isArchived: true },
      include: {
        patient: { select: { firstName: true, lastName: true } },
        _count: { select: { chatSessions: true } }
      },
      orderBy: { archivedAt: 'desc' }
    });

    const programmesWithDetails = archivedPrograms.map(prog => {
      const sixMonthsFromArchive = new Date(prog.archivedAt);
      sixMonthsFromArchive.setMonth(sixMonthsFromArchive.getMonth() + 6);
      
      return {
        id: prog.id,
        titre: prog.titre,
        patient: `${prog.patient.firstName} ${prog.patient.lastName}`,
        archivedAt: prog.archivedAt,
        willBeDeletedAt: sixMonthsFromArchive,
        daysUntilDeletion: Math.ceil((sixMonthsFromArchive - new Date()) / (1000 * 60 * 60 * 24)),
        chatMessagesCount: prog._count.chatSessions
      };
    });

    res.json({
      success: true,
      count: programmesWithDetails.length,
      programmes: programmesWithDetails
    });

  } catch (error) {
    logger.error('Erreur récupération programmes archivés:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des programmes archivés',
      details: error.message
    });
  }
});

/**
 * POST /programmes/cleanup/finished
 * Déclencher manuellement l'archivage des programmes terminés
 */
router.post('/cleanup/finished', async (req, res) => {
  try {
    const result = await archiveFinishedProgramsTask();

    res.json({
      success: true,
      message: 'Archivage des programmes terminés effectué',
      programsArchived: result.programs,
      messagesArchived: result.messages,
      details: result.details,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Erreur archivage manuel programmes terminés:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de l\'archivage des programmes terminés',
      details: error.message
    });
  }
});

/**
 * POST /programmes/cleanup/archived
 * Déclencher manuellement la suppression des programmes archivés > 6 mois
 */
router.post('/cleanup/archived', async (req, res) => {
  try {
    const result = await cleanupOldArchivedProgramsTask();

    res.json({
      success: true,
      message: 'Nettoyage des programmes archivés effectué',
      programsDeleted: result.programs,
      messagesDeleted: result.messages,
      details: result.details,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Erreur nettoyage manuel programmes archivés:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du nettoyage des programmes archivés',
      details: error.message
    });
  }
});

/**
 * GET /programmes/stats
 * Statistiques sur les programmes et conversations
 */
router.get('/stats', async (req, res) => {
  try {
    const prisma = prismaService.getInstance();
    
    const stats = await prisma.$transaction([
      // Programmes actifs
      prisma.programme.count({ where: { isArchived: false } }),
      // Programmes archivés
      prisma.programme.count({ where: { isArchived: true } }),
      // Total messages de chat
      prisma.chatSession.count(),
      // Messages par programmes actifs
      prisma.chatSession.count({
        where: { programme: { isArchived: false } }
      }),
      // Messages par programmes archivés
      prisma.chatSession.count({
        where: { programme: { isArchived: true } }
      }),
    ]);

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const oldArchived = await prisma.programme.count({
      where: {
        isArchived: true,
        archivedAt: { lt: sixMonthsAgo }
      }
    });

    res.json({
      success: true,
      stats: {
        activePrograms: stats[0],
        archivedPrograms: stats[1],
        totalChatMessages: stats[2],
        activeProgramMessages: stats[3],
        archivedProgramMessages: stats[4],
        oldArchivedPrograms: oldArchived,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('Erreur récupération statistiques:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des statistiques',
      details: error.message
    });
  }
});

module.exports = router;