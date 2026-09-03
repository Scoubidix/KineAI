const prismaService = require('./prismaService');
const archiver = require('archiver');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const admin = require('../firebase/firebase');
const logger = require('../utils/logger');
const { sanitizeUID, sanitizeEmail, sanitizeId, sanitizeName } = require('../utils/logSanitizer');
const pionniersChatService = require('./pionniersChatService');

class RGPDService {
  constructor() {
    this.exportTokens = new Map(); // Stockage temporaire des tokens d'export
  }

  /**
   * Génère un export complet des données d'un kiné
   * @param {string} kineUid - UID Firebase du kiné
   * @returns {Promise<{success: boolean, token?: string, expiresAt?: Date, error?: string}>}
   */
  async generateDataExport(kineUid) {
    try {
      const prisma = prismaService.getInstance();
      
      logger.warn(`🔍 Début de l'export RGPD pour le kiné: ${sanitizeUID(kineUid)}`);

      // 1. Récupérer le profil kiné
      const kine = await prisma.kine.findUnique({
        where: { uid: kineUid }
      });

      if (!kine) {
        return { success: false, error: 'Kiné non trouvé' };
      }

      logger.warn(`✅ Kiné trouvé: ${sanitizeName(kine.firstName)} ${sanitizeName(kine.lastName)}`);

      // 2. Collecter toutes les données associées
      const [
        patients,
        programmes,
        exercicesModeles,
        chatIaBasique,
        chatIaBiblio,
        chatIaClinique,
        chatIaAdministrative,
        notifications
      ] = await Promise.all([
        // Patients avec leurs programmes et validations
        prisma.patient.findMany({
          where: { kineId: kine.id },
          include: {
            programmes: {
              include: {
                exercices: {
                  include: { exerciceModele: true }
                },
                chatSessions: true,
                sessionValidations: true
              }
            }
          }
        }),
        
        // Programmes créés
        prisma.programme.findMany({
          where: { patient: { kineId: kine.id } },
          include: {
            patient: { select: { firstName: true, lastName: true } },
            exercices: {
              include: { exerciceModele: true }
            },
            chatSessions: true,
            sessionValidations: true
          }
        }),
        
        // Exercices modèles créés
        prisma.exerciceModele.findMany({
          where: { kineId: kine.id }
        }),
        
        // Historique des chats IA
        prisma.chatIaBasique.findMany({
          where: { kineId: kine.id },
          orderBy: { createdAt: 'desc' }
        }),
        
        prisma.chatIaBiblio.findMany({
          where: { kineId: kine.id },
          orderBy: { createdAt: 'desc' }
        }),
        
        prisma.chatIaClinique.findMany({
          where: { kineId: kine.id },
          orderBy: { createdAt: 'desc' }
        }),
        
        prisma.chatIaAdministrative.findMany({
          where: { kineId: kine.id },
          orderBy: { createdAt: 'desc' }
        }),
        
        // Notifications
        prisma.notification.findMany({
          where: { kineId: kine.id },
          include: {
            patient: { select: { firstName: true, lastName: true } },
            programme: { select: { titre: true } }
          },
          orderBy: { createdAt: 'desc' }
        })
      ]);

      logger.warn(`📊 Données collectées: ${patients.length} patients, ${programmes.length} programmes, ${notifications.length} notifications`);

      // 3. Structurer les données pour l'export
      const exportData = {
        metadata: {
          exportDate: new Date().toISOString(),
          kineInfo: {
            uid: kine.uid,
            firstName: kine.firstName,
            lastName: kine.lastName,
            email: kine.email
          },
          dataTypes: [
            'profil_kine',
            'patients',
            'programmes_exercices', 
            'exercices_modeles',
            'historique_chat_ia',
            'notifications'
          ]
        },
        
        profilKine: {
          informationsPersonnelles: {
            prenom: kine.firstName,
            nom: kine.lastName,
            email: kine.email,
            telephone: kine.phone,
            numeroRPPS: kine.rpps,
            dateNaissance: kine.birthDate,
            adresseCabinet: kine.adresseCabinet,
            dateCreation: kine.createdAt,
            derniereMiseAJour: kine.updatedAt
          },
          abonnement: {
            typeAbonnement: kine.planType,
            statutAbonnement: kine.subscriptionStatus,
            dateDebutAbonnement: kine.subscriptionStartDate,
            dateFinAbonnement: kine.subscriptionEndDate,
            idClientStripe: kine.stripeCustomerId,
            idAbonnementStripe: kine.subscriptionId
          }
        },
        
        patients: patients.map(patient => ({
          id: patient.id,
          prenom: patient.firstName,
          nom: patient.lastName,
          dateNaissance: patient.birthDate,
          telephone: patient.phone,
          email: patient.email,
          objectifs: patient.goals,
          dateCreation: patient.createdAt,
          derniereMiseAJour: patient.updatedAt,
          statutActif: patient.isActive,
          dateSuppression: patient.deletedAt,
          nombreProgrammes: patient.programmes.length
        })),
        
        programmes: programmes.map(programme => ({
          id: programme.id,
          titre: programme.titre,
          description: programme.description,
          duree: programme.duree,
          dateDebut: programme.dateDebut,
          dateFin: programme.dateFin,
          patient: programme.patient,
          statutArchive: programme.isArchived,
          dateArchivage: programme.archivedAt,
          statutActif: programme.isActive,
          dateSuppression: programme.deletedAt,
          exercices: programme.exercices.length,
          sessionsChat: programme.chatSessions.length,
          validationsSession: programme.sessionValidations.length
        })),
        
        exercicesModeles: exercicesModeles.map(exercice => ({
          id: exercice.id,
          nom: exercice.nom,
          description: exercice.description,
          tags: exercice.tags,
          public: exercice.isPublic,
          dateCreation: exercice.createdAt,
          derniereMiseAJour: exercice.updatedAt
        })),
        
        historiqueIA: {
          conversationsBasiques: chatIaBasique.map(chat => ({
            id: chat.id,
            message: chat.message,
            reponse: chat.response,
            dateConversation: chat.createdAt
          })),
          conversationsBibliographiques: chatIaBiblio.map(chat => ({
            id: chat.id,
            message: chat.message,
            reponse: chat.response,
            dateConversation: chat.createdAt
          })),
          conversationsCliniques: chatIaClinique.map(chat => ({
            id: chat.id,
            message: chat.message,
            reponse: chat.response,
            dateConversation: chat.createdAt
          })),
          conversationsAdministratives: chatIaAdministrative.map(chat => ({
            id: chat.id,
            message: chat.message,
            reponse: chat.response,
            dateConversation: chat.createdAt
          }))
        },
        
        notifications: notifications.map(notif => ({
          id: notif.id,
          type: notif.type,
          titre: notif.title,
          message: notif.message,
          lu: notif.isRead,
          dateCreation: notif.createdAt,
          patient: notif.patient,
          programme: notif.programme,
          metadonnees: notif.metadata
        }))
      };

      // 4. Générer le token temporaire
      const exportToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h
      const dataSize = JSON.stringify(exportData).length;

      // 5. Enregistrer l'export en base de données
      const exportRecord = await prisma.rgpdExport.create({
        data: {
          kineId: kine.id,
          exportToken,
          expiresAt,
          fileSize: dataSize,
          ipAddress: null, // Sera ajouté depuis la route si nécessaire
          userAgent: null
        }
      });

      // 6. Stocker temporairement les données avec le token (pour le téléchargement)
      this.exportTokens.set(exportToken, {
        data: exportData,
        expiresAt,
        kineUid,
        generated: new Date(),
        recordId: exportRecord.id
      });

      logger.warn(`🔑 Export RGPD enregistré - ID: ${exportRecord.id} - Token: ${exportToken.substring(0, 8)}... (expire: ${expiresAt})`);

      // 7. Nettoyage automatique des tokens expirés (chaque heure)
      this.cleanupExpiredTokens();

      return {
        success: true,
        token: exportToken,
        expiresAt,
        dataSize,
        recordId: exportRecord.id
      };

    } catch (error) {
      logger.error('❌ Erreur lors de l\'export RGPD:', error.message);
      return { 
        success: false, 
        error: 'Erreur lors de la génération de l\'export',
        details: error.message 
      };
    }
  }

  /**
   * Génère et envoie le fichier ZIP pour un token donné
   * @param {string} token - Token d'export
   * @param {Object} res - Objet response Express
   */
  async downloadExport(token, res) {
    try {
      const exportInfo = this.exportTokens.get(token);
      
      if (!exportInfo) {
        return res.status(404).json({ 
          success: false, 
          error: 'Token d\'export invalide ou expiré' 
        });
      }

      if (new Date() > exportInfo.expiresAt) {
        this.exportTokens.delete(token);
        return res.status(410).json({ 
          success: false, 
          error: 'Token d\'export expiré' 
        });
      }

      // Marquer le téléchargement en base
      try {
        const prisma = prismaService.getInstance();
        await prisma.rgpdExport.update({
          where: { exportToken: token },
          data: { downloadedAt: new Date() }
        });
        logger.warn(`📥 Export téléchargé - Token: ${token.substring(0, 8)}...`);
      } catch (dbError) {
        logger.error('⚠️ Erreur mise à jour téléchargement:', dbError.message);
        // On continue le téléchargement même si la mise à jour échoue
      }

      const { data, kineUid } = exportInfo;
      const filename = `export_rgpd_${data.profilKine.informationsPersonnelles.prenom}_${data.profilKine.informationsPersonnelles.nom}_${new Date().toISOString().split('T')[0]}.zip`;

      logger.warn(`📦 Génération du ZIP pour: ${sanitizeUID(kineUid)}`);

      // Configuration des headers pour le téléchargement
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      // Créer l'archive ZIP
      const archive = archiver('zip', {
        zlib: { level: 9 } // Compression maximale
      });

      archive.on('error', (err) => {
        logger.error('❌ Erreur archivage ZIP:', err.message);
        if (!res.headersSent) {
          res.status(500).json({ success: false, error: 'Erreur lors de la compression' });
        }
      });

      archive.pipe(res);

      // Ajouter les fichiers JSON à l'archive
      archive.append(JSON.stringify(data.metadata, null, 2), { name: 'metadata.json' });
      archive.append(JSON.stringify(data.profilKine, null, 2), { name: 'profil_kine.json' });
      archive.append(JSON.stringify(data.patients, null, 2), { name: 'patients.json' });
      archive.append(JSON.stringify(data.programmes, null, 2), { name: 'programmes.json' });
      archive.append(JSON.stringify(data.exercicesModeles, null, 2), { name: 'exercices_modeles.json' });
      archive.append(JSON.stringify(data.historiqueIA, null, 2), { name: 'historique_ia.json' });
      archive.append(JSON.stringify(data.notifications, null, 2), { name: 'notifications.json' });

      // Ajouter un fichier README explicatif
      const readmeContent = `# Export de vos données RGPD - Mon Assistant Kiné

## Description
Cet export contient toutes vos données personnelles et professionnelles stockées dans notre système.

## Contenu de l'export

### metadata.json
Informations sur cet export (date, utilisateur, types de données)

### profil_kine.json
Vos informations de profil professionnel et d'abonnement

### patients.json
Liste de tous vos patients avec leurs informations personnelles

### programmes.json
Tous les programmes d'exercices que vous avez créés

### exercices_modeles.json
Vos exercices modèles personnalisés

### historique_ia.json
Historique complet de vos conversations avec nos assistants IA

### notifications.json
Toutes les notifications que vous avez reçues

## Informations légales
- Export généré le: ${new Date().toISOString()}
- Valide jusqu'au: ${exportInfo.expiresAt.toISOString()}
- Conforme au RGPD (Article 20 - Droit à la portabilité des données)

## Contact
Pour toute question concernant vos données: contact@monassistantkine.com
`;

      archive.append(readmeContent, { name: 'README.txt' });

      // Finaliser l'archive
      await archive.finalize();

      // Nettoyer le token après utilisation
      this.exportTokens.delete(token);

      logger.warn(`✅ Export ZIP généré et envoyé pour: ${sanitizeUID(kineUid)}`);

    } catch (error) {
      logger.error('❌ Erreur lors du téléchargement:', error.message);
      if (!res.headersSent) {
        res.status(500).json({ 
          success: false, 
          error: 'Erreur lors du téléchargement',
          details: error.message 
        });
      }
    }
  }

  /**
   * Vérifie si l'utilisateur a un export récent et valide
   * @param {string} kineUid - UID Firebase du kiné
   * @returns {Promise<{hasRecentExport: boolean, lastExport?: Object, validUntil?: Date}>}
   */
  async checkRecentExport(kineUid) {
    try {
      const prisma = prismaService.getInstance();
      
      // Récupérer le kiné
      const kine = await prisma.kine.findUnique({
        where: { uid: kineUid }
      });

      if (!kine) {
        return { hasRecentExport: false, error: 'Kiné non trouvé' };
      }

      // Chercher les exports récents (< 7 jours) et valides
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      
      const recentExports = await prisma.rgpdExport.findMany({
        where: {
          kineId: kine.id,
          generatedAt: { gte: sevenDaysAgo },
          isValid: true,
          expiresAt: { gt: new Date() } // Token pas encore expiré
        },
        orderBy: { generatedAt: 'desc' },
        take: 1
      });

      if (recentExports.length === 0) {
        logger.debug(`🔍 Aucun export récent trouvé pour ${sanitizeUID(kineUid)}`);
        return { 
          hasRecentExport: false, 
          message: 'Aucun export de données récent (< 7 jours)' 
        };
      }

      const lastExport = recentExports[0];
      logger.debug(`✅ Export récent trouvé pour ${sanitizeUID(kineUid)} - Date: ${lastExport.generatedAt}`);

      return {
        hasRecentExport: true,
        lastExport: {
          id: lastExport.id,
          generatedAt: lastExport.generatedAt,
          downloadedAt: lastExport.downloadedAt,
          expiresAt: lastExport.expiresAt,
          fileSize: lastExport.fileSize,
          isDownloaded: !!lastExport.downloadedAt
        },
        validUntil: lastExport.expiresAt
      };

    } catch (error) {
      logger.error('❌ Erreur vérification export récent:', error.message);
      return { 
        hasRecentExport: false, 
        error: 'Erreur lors de la vérification des exports' 
      };
    }
  }

  /**
   * Vérifie l'éligibilité complète pour la suppression de compte
   * @param {string} kineUid - UID Firebase du kiné
   * @returns {Promise<{canDelete: boolean, planType: string, hasRecentExport: boolean, reason?: string}>}
   */
  async checkDeletionEligibility(kineUid) {
    try {
      const prisma = prismaService.getInstance();
      
      // 1. Vérifier que le kiné existe et récupérer son plan
      const kine = await prisma.kine.findUnique({
        where: { uid: kineUid }
      });

      if (!kine) {
        return { 
          canDelete: false, 
          planType: 'UNKNOWN', 
          hasRecentExport: false,
          reason: 'Compte kiné non trouvé' 
        };
      }

      const planType = kine.planType || 'FREE';

      // 2. Vérifier le plan (doit être FREE)
      if (planType !== 'FREE') {
        return {
          canDelete: false,
          planType,
          hasRecentExport: false,
          reason: `Vous devez annuler votre abonnement ${planType} avant de supprimer votre compte`
        };
      }

      // 3. Vérifier l'export récent
      const exportCheck = await this.checkRecentExport(kineUid);

      return {
        canDelete: exportCheck.hasRecentExport,
        planType,
        hasRecentExport: exportCheck.hasRecentExport,
        lastExport: exportCheck.lastExport,
        validUntil: exportCheck.validUntil,
        reason: exportCheck.hasRecentExport 
          ? null 
          : 'Vous devez exporter vos données avant de pouvoir supprimer votre compte'
      };

    } catch (error) {
      logger.error('❌ Erreur vérification éligibilité suppression:', error.message);
      return {
        canDelete: false,
        planType: 'UNKNOWN',
        hasRecentExport: false,
        reason: 'Erreur lors de la vérification d\'éligibilité'
      };
    }
  }

  /**
   * Supprime définitivement un compte kiné et toutes ses données
   * @param {string} kineUid - UID Firebase du kiné
   * @returns {Promise<{success: boolean, error?: string, details?: Object}>}
   */
  async deleteAccount(kineUid) {
    try {
      const prisma = prismaService.getInstance();
      
      logger.warn(`🗑️ Début de la suppression de compte pour: ${sanitizeUID(kineUid)}`);

      // 1. Vérifier que le kiné existe et est en plan FREE
      const kine = await prisma.kine.findUnique({
        where: { uid: kineUid }
      });

      if (!kine) {
        return { success: false, error: 'Compte kiné non trouvé' };
      }

      if (kine.planType && kine.planType !== 'FREE') {
        return { 
          success: false, 
          error: 'Vous devez annuler votre abonnement avant de supprimer votre compte',
          planType: kine.planType 
        };
      }

      logger.warn(`✅ Kiné vérifié: ${sanitizeName(kine.firstName)} ${sanitizeName(kine.lastName)} (Plan: ${kine.planType || 'FREE'})`);

      // 2. Compter les données qui vont être supprimées
      const [
        patientsCount,
        programmesCount,
        exercicesModelesCount,
        chatIaCount,
        notificationsCount
      ] = await Promise.all([
        prisma.patient.count({ where: { kineId: kine.id } }),
        prisma.programme.count({ where: { patient: { kineId: kine.id } } }),
        prisma.exerciceModele.count({ where: { kineId: kine.id } }),
        Promise.all([
          prisma.chatIaBasique.count({ where: { kineId: kine.id } }),
          prisma.chatIaBiblio.count({ where: { kineId: kine.id } }),
          prisma.chatIaClinique.count({ where: { kineId: kine.id } }),
          prisma.chatIaAdministrative.count({ where: { kineId: kine.id } })
        ]).then(counts => counts.reduce((sum, count) => sum + count, 0)),
        prisma.notification.count({ where: { kineId: kine.id } })
      ]);

      const deletionDetails = {
        kine: `${kine.firstName} ${kine.lastName}`,
        email: kine.email,
        patients: patientsCount,
        programmes: programmesCount,
        exercicesModeles: exercicesModelesCount,
        chatIA: chatIaCount,
        notifications: notificationsCount,
        deletedAt: new Date().toISOString()
      };

      logger.warn(`📊 Données à supprimer: ${deletionDetails.patients} patients, ${deletionDetails.programmes} programmes`);

      // Les objets GCS ne sont pas concernes par le ON DELETE CASCADE : on les
      // purge avant de perdre la trace des chemins. Best-effort, jamais bloquant.
      try {
        await pionniersChatService.purgeKineImages(kine.id);
      } catch (err) {
        logger.warn(`Purge des images Pionniers echouee pour ${sanitizeUID(kineUid)}: ${err.message}`);
      }

      // 3. Suppression en cascade avec transaction
      await prisma.$transaction(async (tx) => {
        // Supprimer les chats IA
        await tx.chatIaBasique.deleteMany({ where: { kineId: kine.id } });
        await tx.chatIaBiblio.deleteMany({ where: { kineId: kine.id } });
        await tx.chatIaClinique.deleteMany({ where: { kineId: kine.id } });
        await tx.chatIaAdministrative.deleteMany({ where: { kineId: kine.id } });

        // Supprimer les notifications
        await tx.notification.deleteMany({ where: { kineId: kine.id } });

        // Supprimer les exercices modèles
        await tx.exerciceModele.deleteMany({ where: { kineId: kine.id } });

        // Les patients, programmes et leurs données associées seront supprimés automatiquement
        // grâce aux relations en cascade définies dans le schéma Prisma
        await tx.patient.deleteMany({ where: { kineId: kine.id } });

        // Enfin, supprimer le kiné
        await tx.kine.delete({ where: { id: kine.id } });

        logger.warn(`✅ Suppression en base de données terminée pour: ${sanitizeUID(kineUid)}`);
      });

      // 4. Vérification post-suppression (preuve RGPD)
      let verificationOk = true;
      try {
        const kineCheck = await prisma.kine.findUnique({ where: { uid: kineUid } });
        const patientsCheck = await prisma.patient.count({ where: { kineId: kine.id } });
        if (kineCheck || patientsCheck > 0) {
          verificationOk = false;
          logger.error(`⚠️ RGPD CRITICAL: Données résiduelles détectées après suppression pour: ${sanitizeUID(kineUid)} (kine: ${!!kineCheck}, patients: ${patientsCheck})`);
        } else {
          logger.warn(`✅ Vérification RGPD: suppression confirmée pour: ${sanitizeUID(kineUid)}`);
        }
      } catch (verifyError) {
        logger.error('⚠️ Erreur vérification post-suppression (non bloquante):', verifyError.message);
      }

      // 5. Supprimer l'utilisateur Firebase
      try {
        await admin.auth().deleteUser(kineUid);
        logger.warn(`✅ Utilisateur Firebase supprimé: ${sanitizeUID(kineUid)}`);
      } catch (firebaseError) {
        logger.error('⚠️ Erreur suppression Firebase (non bloquante):', firebaseError.message);
        // On continue même si Firebase échoue
      }

      logger.warn(`🎯 Suppression de compte terminée avec succès pour: ${sanitizeUID(kineUid)}`);

      return {
        success: true,
        message: 'Compte supprimé définitivement',
        details: { ...deletionDetails, verificationOk }
      };

    } catch (error) {
      logger.error('❌ Erreur lors de la suppression de compte:', error.message);
      return { 
        success: false, 
        error: 'Erreur lors de la suppression du compte',
        details: error.message 
      };
    }
  }

  /**
   * Nettoie les tokens d'export expirés
   */
  cleanupExpiredTokens() {
    const now = new Date();
    let cleanedCount = 0;

    for (const [token, info] of this.exportTokens.entries()) {
      if (now > info.expiresAt) {
        this.exportTokens.delete(token);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.info(`🧹 ${cleanedCount} token(s) d'export expirés nettoyés`);
    }
  }

  /**
   * Obtient les statistiques des exports
   */
  getExportStats() {
    return {
      activeTokens: this.exportTokens.size,
      tokens: Array.from(this.exportTokens.entries()).map(([token, info]) => ({
        token: token.substring(0, 8) + '...',
        kineUid: info.kineUid,
        generated: info.generated,
        expiresAt: info.expiresAt,
        expired: new Date() > info.expiresAt
      }))
    };
  }
}

// Instance singleton
const rgpdService = new RGPDService();

module.exports = rgpdService;