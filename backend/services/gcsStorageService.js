const { Storage } = require('@google-cloud/storage');
const logger = require('../utils/logger');

/**
 * Service pour gérer l'upload et la suppression de GIFs sur Google Cloud Storage (HDS)
 * Bucket: monassistantkine (région europe-west9, certifié HDS v2.0)
 * Dossier: exercices/
 *
 * Différences avec Firebase Storage:
 * - Fichiers PRIVÉS par défaut (pas de makePublic)
 * - Accès via URLs signées temporaires (expiration configurable)
 * - Conformité HDS pour données de santé
 */

const BUCKET_NAME = process.env.GCS_BUCKET_NAME || 'monassistantkine';
const EXERCICES_FOLDER = 'exercices/';
const AVATARS_FOLDER = 'avatars/';
const DEFAULT_SIGNED_URL_EXPIRATION = 60 * 60 * 1000; // 1 heure en ms

// Magic bytes pour valider le type réel des images
const IMAGE_MAGIC_BYTES = {
  'image/jpeg': [Buffer.from([0xFF, 0xD8, 0xFF])],
  'image/png': [Buffer.from([0x89, 0x50, 0x4E, 0x47])],
  'image/webp': [Buffer.from('RIFF')], // RIFF....WEBP
};

// Initialisation GCS avec les credentials Firebase existants
const storage = new Storage({
  projectId: process.env.FIREBASE_PROJECT_ID,
  credentials: {
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  }
});

const bucket = storage.bucket(BUCKET_NAME);

/**
 * Upload un GIF vers GCS (fichier PRIVÉ par défaut)
 * @param {Buffer} fileBuffer - Buffer du fichier GIF
 * @param {string} fileName - Nom du fichier (sera préfixé avec timestamp)
 * @returns {Promise<string>} Le chemin du fichier (gifPath), PAS l'URL
 */
async function uploadGif(fileBuffer, fileName) {
  try {
    // Générer un nom unique avec timestamp
    const timestamp = Date.now();
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const uniqueFileName = `${timestamp}_${sanitizedFileName}`;
    const gifPath = `${EXERCICES_FOLDER}${uniqueFileName}`;

    const file = bucket.file(gifPath);

    // Upload le buffer - fichier PRIVÉ par défaut (pas de makePublic)
    await file.save(fileBuffer, {
      metadata: {
        contentType: 'image/gif',
        cacheControl: 'private, max-age=3600', // Cache privé 1h
        metadata: {
          uploadedAt: new Date().toISOString(),
        }
      },
      resumable: false,
    });

    // PAS de makePublic() - le fichier reste privé
    // L'accès se fera via URLs signées temporaires

    logger.info(`GIF uploadé sur GCS (privé): ${gifPath}`);
    return gifPath; // Retourne le PATH, pas l'URL

  } catch (error) {
    logger.error('Erreur lors de l\'upload du GIF sur GCS:', error);
    throw new Error(`Échec de l'upload du GIF: ${error.message}`);
  }
}

/**
 * Génère une URL signée temporaire pour accéder à un fichier privé
 * @param {string} gifPath - Le chemin du fichier (ex: "exercices/123_demo.gif")
 * @param {number} expirationMs - Durée de validité en ms (défaut: 1h)
 * @returns {Promise<string|null>} URL signée temporaire ou null si erreur
 */
async function generateSignedUrl(gifPath, expirationMs = DEFAULT_SIGNED_URL_EXPIRATION, version = 'v4') {
  try {
    if (!gifPath) {
      return null;
    }

    const file = bucket.file(gifPath);

    // Vérifier que le fichier existe (optionnel, pour éviter des erreurs)
    const [exists] = await file.exists();
    if (!exists) {
      logger.warn(`Fichier non trouvé sur GCS: ${gifPath}`);
      return null;
    }

    const [signedUrl] = await file.getSignedUrl({
      version: version,
      action: 'read',
      expires: Date.now() + expirationMs,
    });

    return signedUrl;

  } catch (error) {
    logger.error(`Erreur génération URL signée pour ${gifPath}:`, error);
    return null; // Graceful degradation - retourne null au lieu de crasher
  }
}

/**
 * Supprimer un GIF de GCS à partir de son chemin
 * @param {string} gifPath - Chemin du fichier (ex: "exercices/123_demo.gif")
 * @returns {Promise<void>}
 */
async function deleteGif(gifPath) {
  try {
    if (!gifPath) {
      logger.warn('Tentative de suppression d\'un GIF avec chemin vide');
      return;
    }

    // Vérification de sécurité : uniquement dossier exercices/
    if (!gifPath.startsWith(EXERCICES_FOLDER)) {
      logger.error('Tentative de suppression hors du dossier exercices:', gifPath);
      throw new Error('Chemin de fichier non autorisé');
    }

    const file = bucket.file(gifPath);

    // Vérifier si le fichier existe avant de supprimer
    const [exists] = await file.exists();
    if (!exists) {
      logger.warn(`Le fichier n'existe pas sur GCS (déjà supprimé?): ${gifPath}`);
      return;
    }

    // Supprimer le fichier
    await file.delete();
    logger.info(`GIF supprimé de GCS: ${gifPath}`);

  } catch (error) {
    logger.error('Erreur lors de la suppression du GIF sur GCS:', error);
    throw new Error(`Échec de la suppression du GIF: ${error.message}`);
  }
}

/**
 * Génère des URLs signées pour une liste d'exercices
 * Utile pour enrichir les réponses API avec des URLs temporaires
 * @param {Array} exercices - Liste d'exercices avec gifPath
 * @param {number} expirationMs - Durée de validité (défaut: 1h)
 * @returns {Promise<Array>} Exercices enrichis avec gifUrl (URL signée)
 */
async function enrichExercicesWithSignedUrls(exercices, expirationMs = DEFAULT_SIGNED_URL_EXPIRATION) {
  if (!exercices || !Array.isArray(exercices)) {
    return exercices;
  }

  const enriched = await Promise.all(
    exercices.map(async (ex) => {
      // Chercher gifPath directement ou dans exerciceModele (pour les relations)
      const gifPath = ex.gifPath || ex.exerciceModele?.gifPath;

      if (gifPath) {
        const signedUrl = await generateSignedUrl(gifPath, expirationMs);
        return {
          ...ex,
          gifUrl: signedUrl, // Ajoute l'URL signée temporaire
        };
      }

      return {
        ...ex,
        gifUrl: null,
      };
    })
  );

  return enriched;
}

/**
 * Extraire le nom de fichier depuis un chemin GCS
 * @param {string} gifPath - Chemin du fichier
 * @returns {string|null} Nom du fichier ou null si invalide
 */
function extractFileNameFromPath(gifPath) {
  try {
    if (!gifPath) return null;

    // Extraire le nom après le dernier /
    const parts = gifPath.split('/');
    return parts[parts.length - 1] || null;
  } catch (error) {
    logger.error('Erreur lors de l\'extraction du nom de fichier:', error);
    return null;
  }
}

/**
 * Convertir une ancienne URL Firebase en chemin GCS
 * Utile pour la migration
 * @param {string} firebaseUrl - URL Firebase Storage
 * @returns {string|null} Chemin GCS équivalent
 */
function convertFirebaseUrlToGcsPath(firebaseUrl) {
  try {
    if (!firebaseUrl) return null;

    // Format Firebase: https://firebasestorage.googleapis.com/v0/b/BUCKET/o/exercices%2Ffilename.gif?alt=media
    const urlPattern = /\/o\/([^?]+)/;
    const match = firebaseUrl.match(urlPattern);

    if (!match) return null;

    const encodedPath = match[1];
    const decodedPath = decodeURIComponent(encodedPath);

    return decodedPath;
  } catch (error) {
    logger.error('Erreur lors de la conversion URL Firebase → GCS path:', error);
    return null;
  }
}

/**
 * Valide qu'un buffer est bien une image via ses magic bytes
 * @param {Buffer} buffer - Buffer du fichier
 * @returns {{ valid: boolean, detectedType: string|null }}
 */
function validateImageBuffer(buffer) {
  if (!buffer || buffer.length < 12) {
    return { valid: false, detectedType: null };
  }

  for (const [mimeType, signatures] of Object.entries(IMAGE_MAGIC_BYTES)) {
    for (const sig of signatures) {
      if (mimeType === 'image/webp') {
        // WEBP : commence par RIFF et contient WEBP à l'offset 8
        if (buffer.slice(0, 4).equals(sig) && buffer.slice(8, 12).toString() === 'WEBP') {
          return { valid: true, detectedType: mimeType };
        }
      } else if (buffer.slice(0, sig.length).equals(sig)) {
        return { valid: true, detectedType: mimeType };
      }
    }
  }

  return { valid: false, detectedType: null };
}

/**
 * Upload un avatar vers GCS (fichier PRIVE par défaut)
 * @param {Buffer} fileBuffer - Buffer de l'image
 * @param {string} fileName - Nom du fichier
 * @param {string} contentType - MIME type de l'image
 * @returns {Promise<string>} Le chemin du fichier (avatarPath)
 */
async function uploadAvatar(fileBuffer, fileName, contentType) {
  try {
    const timestamp = Date.now();
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const uniqueFileName = `${timestamp}_${sanitizedFileName}`;
    const avatarPath = `${AVATARS_FOLDER}${uniqueFileName}`;

    const file = bucket.file(avatarPath);

    await file.save(fileBuffer, {
      metadata: {
        contentType,
        cacheControl: 'private, max-age=3600',
        metadata: {
          uploadedAt: new Date().toISOString(),
        }
      },
      resumable: false,
    });

    logger.info(`Avatar uploade sur GCS (prive): ${avatarPath}`);
    return avatarPath;

  } catch (error) {
    logger.error('Erreur lors de l\'upload de l\'avatar sur GCS:', error);
    throw new Error(`Echec de l'upload de l'avatar: ${error.message}`);
  }
}

/**
 * Supprimer un avatar de GCS
 * @param {string} avatarPath - Chemin du fichier (ex: "avatars/123_photo.jpg")
 * @returns {Promise<void>}
 */
async function deleteAvatar(avatarPath) {
  try {
    if (!avatarPath) {
      logger.warn('Tentative de suppression d\'un avatar avec chemin vide');
      return;
    }

    // Verification de securite : uniquement dossier avatars/
    if (!avatarPath.startsWith(AVATARS_FOLDER)) {
      logger.error('Tentative de suppression hors du dossier avatars:', avatarPath);
      throw new Error('Chemin de fichier non autorise');
    }

    const file = bucket.file(avatarPath);

    const [exists] = await file.exists();
    if (!exists) {
      logger.warn(`L'avatar n'existe pas sur GCS (deja supprime?): ${avatarPath}`);
      return;
    }

    await file.delete();
    logger.info(`Avatar supprime de GCS: ${avatarPath}`);

  } catch (error) {
    logger.error('Erreur lors de la suppression de l\'avatar sur GCS:', error);
    throw new Error(`Echec de la suppression de l'avatar: ${error.message}`);
  }
}

module.exports = {
  uploadGif,
  generateSignedUrl,
  deleteGif,
  enrichExercicesWithSignedUrls,
  extractFileNameFromPath,
  convertFirebaseUrlToGcsPath,
  uploadAvatar,
  deleteAvatar,
  validateImageBuffer,
  BUCKET_NAME,
  EXERCICES_FOLDER,
  AVATARS_FOLDER,
};
