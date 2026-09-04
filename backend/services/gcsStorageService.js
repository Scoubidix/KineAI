const { Storage } = require('@google-cloud/storage');
const crypto = require('crypto');
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
const CONTRACTS_FOLDER = 'contracts/';
const SUPPORT_FOLDER = 'support/';
const NOUVEAUTES_FOLDER = 'nouveautes/';
const PIONNIERS_FOLDER = 'pionniers/';
const DEFAULT_SIGNED_URL_EXPIRATION = 60 * 60 * 1000; // 1 heure en ms
const CONTRACT_PDF_SIGNED_URL_EXPIRATION = 7 * 24 * 60 * 60 * 1000; // 7 jours en ms

// Magic bytes pour valider le type réel des images
const IMAGE_MAGIC_BYTES = {
  'image/jpeg': [Buffer.from([0xFF, 0xD8, 0xFF])],
  'image/png': [Buffer.from([0x89, 0x50, 0x4E, 0x47])],
  'image/webp': [Buffer.from('RIFF')], // RIFF....WEBP
  'image/gif': [Buffer.from([0x47, 0x49, 0x46, 0x38])], // "GIF8" (GIF87a / GIF89a)
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
 * Upload un média d'exercice vers GCS (fichier PRIVÉ par défaut).
 * Tous les médias d'exercice — MP4, poster JPEG, GIF legacy — restent sous le
 * préfixe `exercices/` : la garde de deleteExerciceMedia en dépend.
 * @returns {Promise<string>} Le chemin du fichier, PAS l'URL
 */
async function uploadExerciceFile(fileBuffer, fileName, contentType) {
  try {
    const timestamp = Date.now();
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = `${EXERCICES_FOLDER}${timestamp}_${sanitizedFileName}`;

    const file = bucket.file(filePath);
    await file.save(fileBuffer, {
      metadata: {
        contentType,
        cacheControl: 'private, max-age=3600',
        metadata: { uploadedAt: new Date().toISOString() },
      },
      resumable: false,
    });

    // PAS de makePublic() : l'accès se fait via URLs signées temporaires.
    logger.info(`Média d'exercice uploadé sur GCS (privé): ${filePath}`);
    return filePath;
  } catch (error) {
    logger.error("Erreur lors de l'upload du média d'exercice sur GCS:", error);
    throw new Error(`Échec de l'upload du média: ${error.message}`);
  }
}

/**
 * DEPRECATED — transition GIF → vidéo (2026-08). Conservée le temps de la
 * transition, plus aucun appelant après le passage au MP4.
 */
async function uploadGif(fileBuffer, fileName) {
  return uploadExerciceFile(fileBuffer, fileName, 'image/gif');
}

/**
 * Dossiers connus du bucket. Une signature demandée hors de ces préfixes ne
 * correspond à aucun usage légitime : c'est le filet par défaut.
 */
const ALL_FOLDERS = [
  EXERCICES_FOLDER,
  AVATARS_FOLDER,
  CONTRACTS_FOLDER,
  SUPPORT_FOLDER,
  NOUVEAUTES_FOLDER,
  PIONNIERS_FOLDER,
];

/**
 * Génère une URL signée temporaire pour accéder à un fichier privé.
 *
 * ⚠️ Le bucket est UNIQUE : contrats, avatars, pièces jointes support et médias
 * d'exercices n'y sont que des préfixes. Signer un chemin sans vérifier son
 * dossier revient donc à donner une clé de lecture sur n'importe quel fichier de
 * la plateforme — et certains chemins viennent du corps d'une requête (les
 * `videoPath`/`posterPath`/`gifPath` d'un exercice). L'appelant déclare le
 * dossier qu'il attend ; à défaut on n'autorise que les dossiers connus.
 *
 * @param {string} gifPath - Le chemin du fichier (ex: "exercices/123_demo.gif")
 * @param {number} expirationMs - Durée de validité en ms (défaut: 1h)
 * @param {string} version - 'v4' (max 7 j) ou 'v2' (longue durée)
 * @param {string[]} allowedPrefixes - Dossiers autorisés pour ce chemin
 * @returns {Promise<string|null>} URL signée temporaire ou null si erreur
 */
async function generateSignedUrl(
  gifPath,
  expirationMs = DEFAULT_SIGNED_URL_EXPIRATION,
  version = 'v4',
  allowedPrefixes = ALL_FOLDERS,
) {
  try {
    if (!gifPath) {
      return null;
    }

    if (!allowedPrefixes.some((prefix) => gifPath.startsWith(prefix))) {
      logger.error('Tentative de signature hors des dossiers autorisés:', gifPath);
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
 * Supprimer un média d'exercice de GCS à partir de son chemin.
 * Sert aussi bien aux MP4 et aux posters qu'aux GIF legacy.
 * @param {string} mediaPath - Chemin du fichier (ex: "exercices/123_demo.mp4")
 */
/**
 * Rapatrie un média d'exercice depuis GCS vers un fichier local.
 *
 * Sert à re-générer un poster à un autre instant : la source d'origine est
 * supprimée après conversion, donc la seule vidéo disponible est celle du
 * bucket, et ffmpeg a besoin d'un fichier local.
 *
 * Même garde de préfixe que la suppression : un chemin arbitraire ne doit pas
 * permettre de rapatrier un avatar, un contrat ou une pièce jointe de support.
 *
 * @param {string} mediaPath - Chemin GCS (ex: "exercices/123_demo.mp4")
 * @param {string} destination - Chemin local du fichier à écrire
 */
async function downloadExerciceMedia(mediaPath, destination) {
  if (!mediaPath) {
    throw new Error('Chemin de fichier manquant');
  }
  if (!mediaPath.startsWith(EXERCICES_FOLDER)) {
    logger.error('Tentative de téléchargement hors du dossier exercices:', mediaPath);
    throw new Error('Chemin de fichier non autorisé');
  }

  const file = bucket.file(mediaPath);
  const [exists] = await file.exists();
  if (!exists) {
    throw new Error(`Fichier introuvable sur GCS: ${mediaPath}`);
  }

  await file.download({ destination });
  logger.info(`Média d'exercice rapatrié depuis GCS: ${mediaPath}`);
}

async function deleteExerciceMedia(mediaPath) {
  try {
    if (!mediaPath) {
      logger.warn("Tentative de suppression d'un média d'exercice avec chemin vide");
      return;
    }

    // Vérification de sécurité : uniquement dossier exercices/
    if (!mediaPath.startsWith(EXERCICES_FOLDER)) {
      logger.error('Tentative de suppression hors du dossier exercices:', mediaPath);
      throw new Error('Chemin de fichier non autorisé');
    }

    const file = bucket.file(mediaPath);

    const [exists] = await file.exists();
    if (!exists) {
      logger.warn(`Le fichier n'existe pas sur GCS (déjà supprimé?): ${mediaPath}`);
      return;
    }

    await file.delete();
    logger.info(`Média d'exercice supprimé de GCS: ${mediaPath}`);
  } catch (error) {
    logger.error("Erreur lors de la suppression du média d'exercice sur GCS:", error);
    throw new Error(`Échec de la suppression du média: ${error.message}`);
  }
}

/** Cadrage des signatures de médias d'exercice (cf. generateSignedUrl). */
const EXERCICE_ONLY = [EXERCICES_FOLDER];

/**
 * URLs signées des médias d'un ExerciceModele.
 * La vidéo prime : quand elle existe, le GIF legacy n'est plus signé — et il
 * n'existe de toute façon plus en base, la règle de remplacement l'ayant effacé.
 * Signer coûte un aller-retour GCS par fichier (file.exists()), on ne signe donc
 * que ce qui sera réellement affiché.
 */
async function signExerciceMediaUrls(source, expirationMs = DEFAULT_SIGNED_URL_EXPIRATION, version = 'v4') {
  const videoPath = source?.videoPath;
  const posterPath = source?.posterPath;
  const gifPath = source?.gifPath;

  // `EXERCICE_ONLY` partout ici : ces trois chemins transitent par le corps des
  // requêtes de création/édition d'exercice. Sans ce cadrage, un chemin pointant
  // vers `contracts/` reviendrait signé dans la réponse.
  if (videoPath) {
    const [videoUrl, posterUrl] = await Promise.all([
      generateSignedUrl(videoPath, expirationMs, version, EXERCICE_ONLY),
      posterPath ? generateSignedUrl(posterPath, expirationMs, version, EXERCICE_ONLY) : Promise.resolve(null),
    ]);
    return { gifUrl: null, videoUrl, posterUrl };
  }

  if (gifPath) {
    return {
      gifUrl: await generateSignedUrl(gifPath, expirationMs, version, EXERCICE_ONLY),
      videoUrl: null,
      posterUrl: null,
    };
  }

  return { gifUrl: null, videoUrl: null, posterUrl: null };
}

/**
 * URL signée de la démo à montrer au patient : la vidéo si elle existe, sinon le
 * GIF legacy. Le type de média est porté par l'extension de l'URL — c'est ce qui
 * permet au chat patient de choisir entre <video> et <img> sans changer de
 * protocole, et sans migrer les messages déjà en base.
 */
async function generateDemoSignedUrl(exerciceModele, expirationMs, version = 'v2') {
  const mediaPath = exerciceModele?.videoPath || exerciceModele?.gifPath;
  if (!mediaPath) return null;
  return generateSignedUrl(mediaPath, expirationMs, version, EXERCICE_ONLY);
}

/**
 * Génère les URLs signées pour une liste d'exercices.
 * Point de passage unique de tous les appelants (exercices publics/privés,
 * templates, programmes) : c'est ici, et pas dans chaque contrôleur, que la
 * transition vidéo se propage.
 * @param {Array} exercices - ExerciceModele, ou relations portant `exerciceModele`
 */
async function enrichExercicesWithSignedUrls(exercices, expirationMs = DEFAULT_SIGNED_URL_EXPIRATION) {
  if (!exercices || !Array.isArray(exercices)) {
    return exercices;
  }

  return Promise.all(
    exercices.map(async (ex) => {
      // Les URLs se posent là où vivent les chemins : sur l'exercice modèle quand
      // l'appelant passe des ExerciceProgramme / ExerciceTemplateItem, sur l'objet
      // lui-même quand il passe des ExerciceModele.
      const nested = ex?.exerciceModele || null;
      const urls = await signExerciceMediaUrls(nested || ex, expirationMs);
      return nested
        ? { ...ex, exerciceModele: { ...nested, ...urls } }
        : { ...ex, ...urls };
    })
  );
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

/**
 * Upload une piece jointe de ticket support vers GCS (fichier PRIVE par defaut)
 * @param {Buffer} fileBuffer - Buffer de l'image
 * @param {string} fileName - Nom du fichier
 * @param {string} contentType - MIME type de l'image
 * @returns {Promise<string>} Le chemin du fichier (imagePath)
 */
async function uploadSupportImage(fileBuffer, fileName, contentType) {
  try {
    const timestamp = Date.now();
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const uniqueFileName = `${timestamp}_${sanitizedFileName}`;
    const imagePath = `${SUPPORT_FOLDER}${uniqueFileName}`;

    const file = bucket.file(imagePath);

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

    logger.info(`Image support uploadee sur GCS (privee): ${imagePath}`);
    return imagePath;

  } catch (error) {
    logger.error('Erreur lors de l\'upload de l\'image support sur GCS:', error);
    throw new Error(`Echec de l'upload de l'image support: ${error.message}`);
  }
}

/**
 * Supprimer une piece jointe de ticket support de GCS
 * @param {string} imagePath - Chemin du fichier (ex: "support/123_bug.png")
 * @returns {Promise<void>}
 */
async function deleteSupportImage(imagePath) {
  try {
    if (!imagePath) {
      logger.warn('Tentative de suppression d\'une image support avec chemin vide');
      return;
    }

    // Verification de securite : uniquement dossier support/
    if (!imagePath.startsWith(SUPPORT_FOLDER)) {
      logger.error('Tentative de suppression hors du dossier support:', imagePath);
      throw new Error('Chemin de fichier non autorise');
    }

    const file = bucket.file(imagePath);

    const [exists] = await file.exists();
    if (!exists) {
      logger.warn(`L'image support n'existe pas sur GCS (deja supprimee?): ${imagePath}`);
      return;
    }

    await file.delete();
    logger.info(`Image support supprimee de GCS: ${imagePath}`);

  } catch (error) {
    logger.error('Erreur lors de la suppression de l\'image support sur GCS:', error);
    throw new Error(`Echec de la suppression de l'image support: ${error.message}`);
  }
}

// Extension de fichier deduite du MIME type reellement detecte (magic bytes),
// jamais de celle annoncee par le client.
const PIONNIER_EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/**
 * Upload une image du salon Groupe Pionniers vers GCS (fichier PRIVE).
 *
 * Le nom d'origine est VOLONTAIREMENT jete : dans un salon entre professionnels
 * de sante, un fichier peut s'appeler « IRM_genou_Dupont_Jean.jpg » et ferait
 * entrer un nom de patient dans le chemin GCS et dans les logs. Le nom stocke
 * est donc entierement genere : horodatage + alea + extension deduite du type
 * reellement detecte.
 *
 * @param {Buffer} fileBuffer - Buffer de l'image
 * @param {string} _fileName - Nom d'origine (ignore, conserve pour l'uniformite de signature)
 * @param {string} contentType - MIME type detecte
 * @returns {Promise<string>} Le chemin du fichier (imagePath)
 */
async function uploadPionnierImage(fileBuffer, _fileName, contentType) {
  try {
    const timestamp = Date.now();
    const random = crypto.randomBytes(8).toString('hex');
    const extension = PIONNIER_EXTENSIONS[contentType] || 'bin';
    const imagePath = `${PIONNIERS_FOLDER}${timestamp}_${random}.${extension}`;

    await bucket.file(imagePath).save(fileBuffer, {
      metadata: {
        contentType,
        cacheControl: 'private, max-age=3600',
        metadata: { uploadedAt: new Date().toISOString() }
      },
      resumable: false,
    });

    logger.info(`Image Pionniers uploadee sur GCS (privee): ${imagePath}`);
    return imagePath;

  } catch (error) {
    logger.error('Erreur lors de l\'upload de l\'image Pionniers sur GCS:', error);
    throw new Error(`Echec de l'upload de l'image: ${error.message}`);
  }
}

/**
 * Supprimer une image du salon Groupe Pionniers de GCS
 * @param {string} imagePath - Chemin du fichier (ex: "pionniers/123_a.png")
 * @returns {Promise<void>}
 */
async function deletePionnierImage(imagePath) {
  try {
    if (!imagePath) {
      logger.warn('Tentative de suppression d\'une image Pionniers avec chemin vide');
      return;
    }

    // Verification de securite : uniquement dossier pionniers/
    if (!imagePath.startsWith(PIONNIERS_FOLDER)) {
      logger.error('Tentative de suppression hors du dossier pionniers:', imagePath);
      throw new Error('Chemin de fichier non autorise');
    }

    const file = bucket.file(imagePath);
    const [exists] = await file.exists();
    if (!exists) {
      logger.warn(`L'image Pionniers n'existe pas sur GCS (deja supprimee?): ${imagePath}`);
      return;
    }

    await file.delete();
    logger.info(`Image Pionniers supprimee de GCS: ${imagePath}`);

  } catch (error) {
    logger.error('Erreur lors de la suppression de l\'image Pionniers sur GCS:', error);
    throw new Error(`Echec de la suppression de l'image: ${error.message}`);
  }
}

/**
 * Upload du PDF final scellé d'un contrat de remplacement/assistanat
 * @param {Buffer} fileBuffer - Buffer du PDF
 * @param {number|string} contractId - ID du contrat
 * @returns {Promise<string>} Path GCS du fichier
 */
async function uploadContractPdf(fileBuffer, contractId) {
  try {
    const path = `${CONTRACTS_FOLDER}${contractId}/contrat-final.pdf`;
    const file = bucket.file(path);
    await file.save(fileBuffer, {
      metadata: {
        contentType: 'application/pdf',
        cacheControl: 'private, max-age=3600',
        metadata: {
          uploadedAt: new Date().toISOString(),
          contractId: String(contractId),
        }
      },
      resumable: false,
    });
    logger.info(`PDF contrat uploadé sur GCS (privé): ${path}`);
    return path;
  } catch (error) {
    logger.error('Erreur upload PDF contrat sur GCS:', error);
    throw new Error(`Échec upload PDF contrat: ${error.message}`);
  }
}

/**
 * Génère une signed URL temporaire (7j par défaut) pour télécharger un PDF de contrat.
 */
async function generateContractPdfSignedUrl(path, expirationMs = CONTRACT_PDF_SIGNED_URL_EXPIRATION) {
  if (!path) return null;
  if (!path.startsWith(CONTRACTS_FOLDER)) {
    logger.error(`Chemin invalide pour signed URL contrat: ${path}`);
    return null;
  }
  return generateSignedUrl(path, expirationMs, 'v4', [CONTRACTS_FOLDER]);
}

/**
 * Supprime un PDF de contrat (cleanup ou regénération)
 */
async function deleteContractPdf(path) {
  if (!path) return;
  if (!path.startsWith(CONTRACTS_FOLDER)) {
    throw new Error(`Chemin non autorisé pour suppression contrat: ${path}`);
  }
  const file = bucket.file(path);
  const [exists] = await file.exists();
  if (!exists) {
    logger.warn(`PDF contrat absent (déjà supprimé?): ${path}`);
    return;
  }
  await file.delete();
  logger.info(`PDF contrat supprimé de GCS: ${path}`);
}

/**
 * Upload une image/GIF de nouveauté vers GCS (fichier PRIVE par défaut).
 * @param {Buffer} fileBuffer - Buffer de l'image/GIF
 * @param {string} fileName - Nom du fichier
 * @param {string} contentType - MIME type (image/gif|png|jpeg|webp)
 * @returns {Promise<string>} Le chemin du fichier (imagePath)
 */
async function uploadNouveauteImage(fileBuffer, fileName, contentType) {
  try {
    const timestamp = Date.now();
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const imagePath = `${NOUVEAUTES_FOLDER}${timestamp}_${sanitizedFileName}`;

    const file = bucket.file(imagePath);
    await file.save(fileBuffer, {
      metadata: {
        contentType,
        cacheControl: 'private, max-age=3600',
        metadata: { uploadedAt: new Date().toISOString() },
      },
      resumable: false,
    });

    logger.info(`Image nouveaute uploadee sur GCS (privee): ${imagePath}`);
    return imagePath;
  } catch (error) {
    logger.error('Erreur upload image nouveaute sur GCS:', error);
    throw new Error(`Echec de l'upload de l'image de nouveaute: ${error.message}`);
  }
}

/**
 * Supprimer une image de nouveauté de GCS.
 * @param {string} imagePath - Chemin du fichier (ex: "nouveautes/123_visio.gif")
 * @returns {Promise<void>}
 */
async function deleteNouveauteImage(imagePath) {
  try {
    if (!imagePath) return;
    if (!imagePath.startsWith(NOUVEAUTES_FOLDER)) {
      logger.error('Tentative de suppression hors du dossier nouveautes:', imagePath);
      throw new Error('Chemin de fichier non autorise');
    }
    const file = bucket.file(imagePath);
    const [exists] = await file.exists();
    if (!exists) {
      logger.warn(`Image nouveaute absente (deja supprimee?): ${imagePath}`);
      return;
    }
    await file.delete();
    logger.info(`Image nouveaute supprimee de GCS: ${imagePath}`);
  } catch (error) {
    logger.error('Erreur suppression image nouveaute sur GCS:', error);
    throw new Error(`Echec de la suppression de l'image de nouveaute: ${error.message}`);
  }
}

module.exports = {
  uploadGif, // DEPRECATED — transition GIF → vidéo
  uploadExerciceFile,
  downloadExerciceMedia,
  generateSignedUrl,
  signExerciceMediaUrls,
  generateDemoSignedUrl,
  deleteExerciceMedia,
  enrichExercicesWithSignedUrls,
  extractFileNameFromPath,
  convertFirebaseUrlToGcsPath,
  uploadAvatar,
  deleteAvatar,
  validateImageBuffer,
  uploadSupportImage,
  deleteSupportImage,
  uploadContractPdf,
  generateContractPdfSignedUrl,
  deleteContractPdf,
  uploadNouveauteImage,
  deleteNouveauteImage,
  uploadPionnierImage,
  deletePionnierImage,
  BUCKET_NAME,
  EXERCICES_FOLDER,
  AVATARS_FOLDER,
  CONTRACTS_FOLDER,
  SUPPORT_FOLDER,
  NOUVEAUTES_FOLDER,
  PIONNIERS_FOLDER,
};
