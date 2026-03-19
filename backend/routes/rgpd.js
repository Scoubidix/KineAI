const express = require('express');
const logger = require('../utils/logger');
const router = express.Router();
const { authenticate } = require('../middleware/authenticate');
const rgpdService = require('../services/rgpdService');
const { sanitizeUID } = require('../utils/logSanitizer');

/**
 * POST /api/rgpd/export-data
 * Génère un export ZIP des données utilisateur
 */
router.post('/export-data', authenticate, async (req, res) => {
  try {
    const kineUid = req.uid;
    
    logger.debug(`📦 Demande d'export RGPD pour: ${sanitizeUID(kineUid)}`);

    const result = await rgpdService.generateDataExport(kineUid);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        details: result.details
      });
    }

    res.json({
      success: true,
      message: 'Export généré avec succès',
      token: result.token,
      expiresAt: result.expiresAt,
      downloadUrl: `/api/rgpd/download/${result.token}`,
      dataSize: result.dataSize,
      validUntil: result.expiresAt.toISOString(),
      instructions: {
        fr: 'Cliquez sur le lien de téléchargement pour obtenir votre export ZIP. Ce lien expire dans 24 heures.',
        en: 'Click the download link to get your ZIP export. This link expires in 24 hours.'
      }
    });

  } catch (error) {
    logger.error('❌ Erreur route export RGPD:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la génération de l\'export',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /api/rgpd/download/:token
 * Télécharge le fichier ZIP d'export
 */
router.get('/download/:token', async (req, res) => {
  try {
    const { token } = req.params;
    
    logger.debug(`📥 Téléchargement d'export RGPD - Token: ${token.substring(0, 8)}...`);

    // Le service gère directement la réponse
    await rgpdService.downloadExport(token, res);

  } catch (error) {
    logger.error('❌ Erreur téléchargement export:', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: 'Erreur lors du téléchargement',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
});

/**
 * GET /api/rgpd/eligibility
 * Vérifie l'éligibilité pour la suppression de compte
 */
router.get('/eligibility', authenticate, async (req, res) => {
  try {
    const kineUid = req.uid;
    
    logger.debug(`🔍 Vérification éligibilité suppression pour: ${sanitizeUID(kineUid)}`);

    const eligibility = await rgpdService.checkDeletionEligibility(kineUid);

    res.json({
      success: true,
      ...eligibility,
      checkedAt: new Date().toISOString()
    });

  } catch (error) {
    logger.error('❌ Erreur route éligibilité RGPD:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la vérification d\'éligibilité',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * POST /api/rgpd/delete-account
 * Supprime définitivement un compte utilisateur
 */
router.post('/delete-account', authenticate, async (req, res) => {
  try {
    const kineUid = req.uid;
    const { 
      confirmationText, 
      understands7DaysDelay,
      agreesToDataLoss 
    } = req.body;

    logger.debug(`🗑️ Demande de suppression de compte pour: ${sanitizeUID(kineUid)}`);

    // 1. Vérifications de sécurité frontend
    if (!confirmationText || confirmationText !== 'SUPPRIMER') {
      return res.status(400).json({
        success: false,
        error: 'Vous devez saisir exactement "SUPPRIMER" pour confirmer',
        code: 'CONFIRMATION_INVALID'
      });
    }

    if (!understands7DaysDelay || !agreesToDataLoss) {
      return res.status(400).json({
        success: false,
        error: 'Vous devez accepter toutes les conditions',
        code: 'CONDITIONS_NOT_ACCEPTED'
      });
    }

    // 2. Vérification automatique de l'éligibilité (plan + export récent)
    const eligibility = await rgpdService.checkDeletionEligibility(kineUid);

    if (!eligibility.canDelete) {
      let code = 'DELETION_NOT_ALLOWED';
      if (eligibility.planType !== 'FREE') {
        code = 'SUBSCRIPTION_ACTIVE';
      } else if (!eligibility.hasRecentExport) {
        code = 'EXPORT_REQUIRED';
      }

      return res.status(400).json({
        success: false,
        error: eligibility.reason,
        planType: eligibility.planType,
        hasRecentExport: eligibility.hasRecentExport,
        code
      });
    }

    logger.debug(`✅ Éligibilité confirmée - Plan: ${eligibility.planType}, Export: ${eligibility.hasRecentExport}`);

    // 3. Supprimer le compte
    const result = await rgpdService.deleteAccount(kineUid);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        code: 'DELETION_ERROR',
        details: result.details
      });
    }

    logger.debug(`✅ Compte supprimé avec succès:`, result.details);

    res.json({
      success: true,
      message: 'Votre compte a été supprimé définitivement',
      details: {
        deletedData: {
          patients: result.details.patients,
          programmes: result.details.programmes,
          exercicesModeles: result.details.exercicesModeles,
          conversationsIA: result.details.chatIA,
          notifications: result.details.notifications
        },
        deletedAt: result.details.deletedAt,
        kineInfo: {
          nom: result.details.kine,
          email: result.details.email
        }
      },
      nextSteps: {
        fr: [
          'Votre compte a été supprimé définitivement',
          'Toutes vos données ont été effacées de nos serveurs',
          'Vous ne pouvez plus vous connecter à l\'application',
          'Si vous souhaitez utiliser nos services à nouveau, vous devrez créer un nouveau compte'
        ],
        en: [
          'Your account has been permanently deleted',
          'All your data has been erased from our servers',
          'You can no longer log in to the application',
          'If you wish to use our services again, you will need to create a new account'
        ]
      }
    });

  } catch (error) {
    logger.error('❌ Erreur route suppression compte:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la suppression du compte',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      code: 'SERVER_ERROR'
    });
  }
});

/**
 * GET /api/rgpd/stats (Route admin/debug)
 * Obtient les statistiques des exports en cours
 */
router.get('/stats', authenticate, async (req, res) => {
  try {
    // Route réservée aux admins en prod
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({
        success: false,
        error: 'Route non disponible en production'
      });
    }

    const stats = rgpdService.getExportStats();
    res.json({
      success: true,
      stats
    });

  } catch (error) {
    logger.error('❌ Erreur stats RGPD:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des statistiques'
    });
  }
});

/**
 * POST /api/rgpd/cleanup (Route admin/maintenance)
 * Force le nettoyage des tokens expirés
 */
router.post('/cleanup', authenticate, async (req, res) => {
  try {
    // Route réservée aux admins en prod
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({
        success: false,
        error: 'Route non disponible en production'
      });
    }

    rgpdService.cleanupExpiredTokens();
    
    res.json({
      success: true,
      message: 'Nettoyage des tokens effectué',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('❌ Erreur cleanup RGPD:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du nettoyage'
    });
  }
});

module.exports = router;