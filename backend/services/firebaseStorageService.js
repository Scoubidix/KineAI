const admin = require('../firebase/firebase');
const logger = require('../utils/logger');
const path = require('path');

/**
 * Service pour gérer l'upload et la suppression de GIFs sur Firebase Storage
 * Bucket: mon-assistant-kine-39f38.firebasestorage.app
 * Dossier: exercices/
 */

const BUCKET_NAME = 'mon-assistant-kine-39f38.firebasestorage.app';
const EXERCICES_FOLDER = 'exercices/';

/**
 * Upload un GIF vers Firebase Storage
 * @param {Buffer} fileBuffer - Buffer du fichier GIF
 * @param {string} fileName - Nom du fichier (sera préfixé avec timestamp)
 * @returns {Promise<string>} URL publique du GIF uploadé
 */
async function uploadGif(fileBuffer, fileName) {
  try {
    const bucket = admin.storage().bucket(BUCKET_NAME);

    // Générer un nom unique avec timestamp
    const timestamp = Date.now();
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const uniqueFileName = `${timestamp}_${sanitizedFileName}`;
    const filePath = `${EXERCICES_FOLDER}${uniqueFileName}`;

    // Créer un fichier dans le bucket
    const file = bucket.file(filePath);

    // Upload le buffer
    await file.save(fileBuffer, {
      metadata: {
        contentType: 'image/gif',
        metadata: {
          uploadedAt: new Date().toISOString(),
        }
      },
      public: true, // Rendre le fichier public
    });

    // Rendre le fichier publiquement accessible
    await file.makePublic();

    // Générer l'URL publique
    const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${BUCKET_NAME}/o/${encodeURIComponent(filePath)}?alt=media`;

    logger.info(`GIF uploadé avec succès: ${publicUrl}`);
    return publicUrl;

  } catch (error) {
    logger.error('Erreur lors de l\'upload du GIF sur Firebase Storage:', error);
    throw new Error('Échec de l\'upload du GIF');
  }
}

/**
 * Supprimer un GIF de Firebase Storage à partir de son URL
 * @param {string} gifUrl - URL publique du GIF à supprimer
 * @returns {Promise<void>}
 */
async function deleteGif(gifUrl) {
  try {
    if (!gifUrl) {
      logger.warn('Tentative de suppression d\'un GIF avec URL vide');
      return;
    }

    const bucket = admin.storage().bucket(BUCKET_NAME);

    // Extraire le chemin du fichier depuis l'URL
    // Format: https://firebasestorage.googleapis.com/v0/b/BUCKET/o/ENCODED_PATH?alt=media
    const urlPattern = /\/o\/([^?]+)/;
    const match = gifUrl.match(urlPattern);

    if (!match) {
      logger.error('Format d\'URL Firebase Storage invalide:', gifUrl);
      throw new Error('Format d\'URL invalide');
    }

    const encodedPath = match[1];
    const filePath = decodeURIComponent(encodedPath);

    // Vérifier que le fichier est bien dans le dossier exercices/
    if (!filePath.startsWith(EXERCICES_FOLDER)) {
      logger.error('Tentative de suppression d\'un fichier hors du dossier exercices:', filePath);
      throw new Error('Chemin de fichier non autorisé');
    }

    const file = bucket.file(filePath);

    // Vérifier si le fichier existe avant de supprimer
    const [exists] = await file.exists();
    if (!exists) {
      logger.warn(`Le fichier n'existe pas: ${filePath}`);
      return;
    }

    // Supprimer le fichier
    await file.delete();
    logger.info(`GIF supprimé avec succès: ${filePath}`);

  } catch (error) {
    logger.error('Erreur lors de la suppression du GIF sur Firebase Storage:', error);
    throw new Error('Échec de la suppression du GIF');
  }
}

/**
 * Extraire le nom de fichier depuis une URL Firebase Storage
 * @param {string} gifUrl - URL publique du GIF
 * @returns {string|null} Nom du fichier ou null si invalide
 */
function extractFileNameFromUrl(gifUrl) {
  try {
    if (!gifUrl) return null;

    const urlPattern = /\/o\/([^?]+)/;
    const match = gifUrl.match(urlPattern);

    if (!match) return null;

    const encodedPath = match[1];
    const filePath = decodeURIComponent(encodedPath);

    return path.basename(filePath);
  } catch (error) {
    logger.error('Erreur lors de l\'extraction du nom de fichier:', error);
    return null;
  }
}

module.exports = {
  uploadGif,
  deleteGif,
  extractFileNameFromUrl,
};
