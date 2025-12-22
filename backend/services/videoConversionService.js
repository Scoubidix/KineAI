const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const ffprobeInstaller = require('@ffprobe-installer/ffprobe');
const logger = require('../utils/logger');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs'); // Pour lecture synchrone magic bytes
const os = require('os');
const { promisify } = require('util');

// Configurer les chemins vers les binaires ffmpeg et ffprobe
ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

// Promisify ffprobe pour validation durée vidéo
const ffprobe = promisify(ffmpeg.ffprobe);

/**
 * Valider les magic bytes du fichier vidéo
 * Empêche upload de fichiers non-vidéo déguisés
 * @param {string} filePath - Chemin du fichier à valider
 * @returns {boolean} true si vidéo valide, false sinon
 */
function validateMagicBytes(filePath) {
  try {
    const buffer = Buffer.allocUnsafe(12);
    const fd = fsSync.openSync(filePath, 'r');
    fsSync.readSync(fd, buffer, 0, 12, 0);
    fsSync.closeSync(fd);

    // MP4/MOV: "ftyp" à offset 4-7
    const isMP4 = buffer.slice(4, 8).toString('ascii') === 'ftyp';

    // AVI: "RIFF" au début
    const isAVI = buffer.slice(0, 4).toString('ascii') === 'RIFF';

    return isMP4 || isAVI;
  } catch (error) {
    logger.error('Erreur validation magic bytes:', error);
    return false;
  }
}

/**
 * Obtenir la durée d'une vidéo en secondes
 * @param {string} filePath - Chemin du fichier vidéo
 * @returns {Promise<number>} Durée en secondes
 */
async function getVideoDuration(filePath) {
  const metadata = await ffprobe(filePath);
  return metadata.format.duration;
}

/**
 * Configuration pour la conversion vidéo → GIF
 */
const GIF_CONFIG = {
  width: 480,           // Résolution: 480p
  fps: 10,              // 10 frames par seconde
  maxSizeMB: 3,         // Taille max du GIF: ~3MB
  quality: 'medium',    // Qualité: medium pour équilibrer taille/qualité
};

/**
 * Convertir une vidéo en GIF optimisé
 * @param {string} videoPath - Chemin du fichier vidéo source
 * @param {string} outputFileName - Nom du fichier GIF de sortie (sans extension)
 * @returns {Promise<{buffer: Buffer, fileName: string}>} Buffer du GIF et nom du fichier
 */
async function convertVideoToGif(videoPath, outputFileName) {
  const TIMEOUT_MS = 120000; // 2 minutes max

  const conversionPromise = new Promise((resolve, reject) => {
    try {
      // Créer un fichier temporaire pour le GIF
      const tempDir = os.tmpdir();
      const gifFileName = `${outputFileName}.gif`;
      const outputPath = path.join(tempDir, gifFileName);

      logger.info(`Conversion vidéo → GIF: ${videoPath} → ${outputPath}`);

      ffmpeg(videoPath)
        // Résolution et FPS
        .size(`${GIF_CONFIG.width}x?`) // Largeur fixe, hauteur auto pour garder ratio
        .fps(GIF_CONFIG.fps)

        // Filtres pour optimiser la qualité et la taille
        .outputOptions([
          '-vf', `fps=${GIF_CONFIG.fps},scale=${GIF_CONFIG.width}:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5`,
        ])

        // Format de sortie
        .format('gif')
        .output(outputPath)

        // Gestion des événements
        .on('start', (commandLine) => {
          logger.info('Commande ffmpeg:', commandLine);
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            logger.info(`Progression conversion: ${Math.round(progress.percent)}%`);
          }
        })
        .on('end', async () => {
          try {
            logger.info('Conversion terminée avec succès');

            // Lire le fichier GIF généré
            const gifBuffer = await fs.readFile(outputPath);

            // Vérifier la taille
            const sizeInMB = gifBuffer.length / (1024 * 1024);
            logger.info(`Taille du GIF: ${sizeInMB.toFixed(2)} MB`);

            const MAX_GIF_SIZE_MB = 5;
            if (sizeInMB > MAX_GIF_SIZE_MB) {
              await fs.unlink(outputPath).catch(() => {}); // Cleanup
              throw new Error(`GIF trop volumineux: ${sizeInMB.toFixed(2)}MB (max ${MAX_GIF_SIZE_MB}MB). Réduisez la durée ou la qualité de votre vidéo.`);
            }

            // Nettoyer le fichier temporaire
            await fs.unlink(outputPath).catch(err =>
              logger.warn('Erreur lors de la suppression du fichier temporaire:', err)
            );

            resolve({
              buffer: gifBuffer,
              fileName: gifFileName,
              sizeInMB: parseFloat(sizeInMB.toFixed(2))
            });

          } catch (error) {
            logger.error('Erreur lors de la lecture du GIF généré:', error);
            reject(new Error('Échec de la lecture du GIF généré'));
          }
        })
        .on('error', (err) => {
          logger.error('Erreur lors de la conversion ffmpeg:', err);
          reject(new Error(`Échec de la conversion: ${err.message}`));
        })
        .run();

    } catch (error) {
      logger.error('Erreur lors de l\'initialisation de la conversion:', error);
      reject(error);
    }
  });

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Conversion timeout: la vidéo prend trop de temps à convertir (max 2 minutes)')), TIMEOUT_MS)
  );

  return Promise.race([conversionPromise, timeoutPromise]);
}

/**
 * Valider un fichier vidéo uploadé
 * @param {Object} file - Objet file de multer
 * @param {number} maxSizeMB - Taille max en MB (défaut: 30MB)
 * @returns {Promise<Object>} { valid: boolean, error?: string }
 */
async function validateVideoFile(file, maxSizeMB = 30) {
  if (!file) {
    return { valid: false, error: 'Aucun fichier fourni' };
  }

  // Vérifier les magic bytes (vraie signature du fichier)
  if (!validateMagicBytes(file.path)) {
    return {
      valid: false,
      error: 'Fichier invalide. Seules les vraies vidéos MP4, MOV, AVI sont acceptées.'
    };
  }

  // Vérifier le type MIME
  const allowedMimeTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo'];
  if (!allowedMimeTypes.includes(file.mimetype)) {
    return {
      valid: false,
      error: 'Format de fichier non supporté. Formats acceptés: MP4, MOV, AVI'
    };
  }

  // Vérifier la taille
  const sizeInMB = file.size / (1024 * 1024);
  if (sizeInMB > maxSizeMB) {
    return {
      valid: false,
      error: `Fichier trop volumineux. Taille max: ${maxSizeMB}MB (fichier: ${sizeInMB.toFixed(2)}MB)`
    };
  }

  // Vérifier la durée de la vidéo (max 20 secondes)
  try {
    const duration = await getVideoDuration(file.path);
    if (duration > 20) {
      return {
        valid: false,
        error: `Vidéo trop longue: ${Math.round(duration)}s. Maximum 20 secondes pour un exercice.`
      };
    }
  } catch (error) {
    logger.warn('Impossible de vérifier la durée vidéo:', error);
    // On continue, pas critique
  }

  return { valid: true };
}

module.exports = {
  convertVideoToGif,
  validateVideoFile,
  GIF_CONFIG,
};
