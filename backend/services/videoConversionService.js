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
 * Métadonnées utiles d'une source.
 * `colorTransfer` vaut `smpte2084` (Dolby Vision / PQ) ou `arib-std-b67` (HLG)
 * sur une vidéo HDR — un transcodage naïf en H.264 8 bits la rendrait grise et
 * fade, ce qui se voit beaucoup sur une démo d'exercice.
 */
async function probeVideo(filePath) {
  const metadata = await ffprobe(filePath);
  const stream = (metadata.streams || []).find((s) => s.codec_type === 'video') || {};
  return {
    duration: metadata.format?.duration ? Number(metadata.format.duration) : null,
    width: stream.width || null,
    height: stream.height || null,
    colorTransfer: stream.color_transfer || null,
  };
}

/**
 * Configuration du transcodage vidéo. 720p suffit sur une card de 300 px et
 * dans une lightbox de téléphone, pour moitié moins de poids qu'en 1080p.
 */
const VIDEO_CONFIG = {
  maxSizeMB: 50,      // couvre 15 s en 1080p, HEVC comme H.264
  maxDurationS: 15,   // assez pour un mouvement complet
  height: 720,        // largeur automatique paire (H.264 l'exige)
  crf: 23,
  maxrate: '3M',      // plafond dur : ~5,5 Mo au pire pour 15 s
  bufsize: '6M',
  fps: 30,            // plafonne les sources 60 im/s
};

/** Fonctions de transfert HDR : sans tonemapping, l'image sort délavée. */
const HDR_TRANSFERS = ['smpte2084', 'arib-std-b67']; // Dolby Vision/PQ, HLG

/**
 * Le binaire embarqué expose-t-il `zscale` (libzimg) ? Sondé une seule fois par
 * processus. Le build Windows de @ffmpeg-installer l'a ; celui de Clever Cloud
 * (linux-x64) est à vérifier au déploiement — d'où le repli, plutôt qu'une
 * hypothèse.
 */
let zscaleAvailable = null;
function hasZscale() {
  if (zscaleAvailable !== null) return zscaleAvailable;
  try {
    const { execFileSync } = require('child_process');
    const filters = execFileSync(ffmpegInstaller.path, ['-hide_banner', '-filters'], {
      encoding: 'utf8',
      timeout: 10000,
    });
    zscaleAvailable = /\bzscale\b/.test(filters);
  } catch (error) {
    logger.warn('Impossible de sonder les filtres ffmpeg, zscale supposé absent:', error.message);
    zscaleAvailable = false;
  }
  logger.info(`ffmpeg: filtre zscale ${zscaleAvailable ? 'disponible' : 'absent'}`);
  return zscaleAvailable;
}

/**
 * Chaîne de filtres commune à la vidéo et au poster : mise à l'échelle 720p,
 * puis tonemapping si la source est HDR. Le poster doit subir exactement le
 * même traitement, sinon il ressort délavé alors que la vidéo est correcte.
 *
 * `scale=-2:720` : hauteur 720, largeur automatique paire (H.264 l'exige).
 * `format=yuv420p` : 8 bits 4:2:0, le seul profil lu partout.
 * La rotation EXIF est appliquée automatiquement par ffmpeg dès qu'un filtre
 * `-vf` est présent (autorotate actif par défaut) et aplatie dans le flux.
 */
function buildFilterChain(colorTransfer) {
  const scale = `scale=-2:${VIDEO_CONFIG.height}:flags=lanczos`;

  if (!HDR_TRANSFERS.includes(colorTransfer)) {
    return `${scale},format=yuv420p`;
  }

  if (hasZscale()) {
    return `${scale},zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,`
      + `tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p`;
  }

  // `iall=bt2020` et non `bt2020nc` : le filtre `colorspace` n'accepte comme
  // « système » que bt470m, bt470bg, bt601-6-525, bt601-6-625, bt709,
  // smpte170m, smpte240m et bt2020. `bt2020nc` fait échouer ffmpeg au
  // lancement — donc ce repli, censé sauver le rendu, tuerait le transcodage.
  logger.warn('Source HDR sans zscale : repli sur colorspace=all=bt709 (rendu approximatif)');
  return `${scale},colorspace=all=bt709:iall=bt2020:fast=1,format=yuv420p`;
}

/**
 * DEPRECATED — transition GIF → vidéo (2026-08). Plus aucun appelant : le
 * pipeline d'upload produit désormais un MP4. Retrait prévu en phase 4, quand
 * le compteur de convergence approchera de zéro.
 */
const GIF_CONFIG = {
  width: 320,           // Résolution: 320p (optimisé pour taille fichier)
  fps: 8,               // 8 frames par seconde (fluide mais léger)
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

            const MAX_GIF_SIZE_MB = 8;
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
 * Transcoder une source en MP4 H.264 720p, sans audio, prêt pour la lecture en
 * flux. Le transcodage n'est pas optionnel : les iPhone filment en HEVC/H.265
 * par défaut, que ni Chrome ni Firefox ne lisent.
 */
async function transcodeToMp4(inputPath, outputBaseName, probe) {
  const TIMEOUT_MS = 180000; // 3 min : 15 s de 4K prennent plus qu'un GIF de 320 px
  const outputPath = path.join(os.tmpdir(), `${outputBaseName}.mp4`);
  const fileName = `${outputBaseName}.mp4`;

  // La commande est capturée : si le délai gagne la course, il faut tuer le
  // processus ffmpeg et effacer le fichier partiel. Sans ça, un transcodage
  // qui déborde laisse un MP4 de plusieurs dizaines de Mo dans le dossier
  // temporaire et un ffmpeg qui continue de tourner après l'erreur rendue au
  // client — sur un serveur qui vit longtemps, ça s'accumule.
  let command;
  let timer;

  const conversion = new Promise((resolve, reject) => {
    command = ffmpeg(inputPath)
      .outputOptions([
        '-vf', buildFilterChain(probe?.colorTransfer),
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', String(VIDEO_CONFIG.crf),
        // Qualité constante mais plafond dur, pour borner le poids du fichier.
        '-maxrate', VIDEO_CONFIG.maxrate,
        '-bufsize', VIDEO_CONFIG.bufsize,
        '-r', String(VIDEO_CONFIG.fps),
        '-profile:v', 'high',
        '-level', '4.0',
        '-pix_fmt', 'yuv420p',
        // Une vidéo tournée au cabinet peut capter des voix, y compris d'autres
        // patients : la piste audio est supprimée, pas atténuée.
        '-an',
        // Sans faststart, l'index du MP4 est en fin de fichier et le navigateur
        // doit tout télécharger avant la première image.
        '-movflags', '+faststart',
      ])
      .format('mp4')
      .output(outputPath)
      .on('start', (commandLine) => logger.info('Commande ffmpeg (mp4):', commandLine))
      .on('end', () => resolve())
      .on('error', (err) => {
        logger.error('Erreur transcodage MP4:', err);
        reject(new Error(`Échec de la conversion vidéo: ${err.message}`));
      });
    command.run();
  });

  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error('Conversion timeout: la vidéo prend trop de temps à convertir (max 3 minutes)')),
      TIMEOUT_MS,
    );
  });

  try {
    await Promise.race([conversion, timeout]);
  } catch (error) {
    try {
      command?.kill('SIGKILL');
    } catch (killError) {
      logger.warn('Impossible de tuer le processus ffmpeg:', killError);
    }
    await fs.unlink(outputPath).catch(() => {});
    throw error;
  } finally {
    clearTimeout(timer);
  }

  const buffer = await fs.readFile(outputPath);
  const sizeInMB = parseFloat((buffer.length / (1024 * 1024)).toFixed(2));

  // Dimensions réelles du fichier produit : elles servent au front à signaler
  // un cadrage vertical avant validation.
  let out = { width: null, height: null };
  try {
    const outProbe = await module.exports.probeVideo(outputPath);
    out = { width: outProbe.width, height: outProbe.height };
  } catch (error) {
    logger.warn('Impossible de relire les dimensions du MP4 produit:', error);
  }

  await fs.unlink(outputPath).catch((err) =>
    logger.warn('Erreur suppression du MP4 temporaire:', err)
  );

  logger.info(`MP4 généré: ${fileName} (${sizeInMB} MB, ${out.width}x${out.height})`);
  return { buffer, fileName, sizeInMB, ...out };
}

/**
 * Extraire l'image d'aperçu. À une seconde plutôt qu'à zéro : la première image
 * d'une vidéo de téléphone est souvent floue, ou montre la main qui vient
 * d'appuyer. Sur une source plus courte, on prend le milieu.
 */
async function extractPoster(inputPath, outputBaseName, probe) {
  const TIMEOUT_MS = 60000;
  const at = probe?.duration ? Math.min(1, probe.duration / 2) : 0;
  const outputPath = path.join(os.tmpdir(), `${outputBaseName}.jpg`);
  const fileName = `${outputBaseName}.jpg`;

  // Même garde que le transcodage : tuer ffmpeg et nettoyer si le délai gagne.
  let command;
  let timer;

  const extraction = new Promise((resolve, reject) => {
    command = ffmpeg(inputPath)
      .seekInput(at)
      .outputOptions([
        '-frames:v', '1',
        '-vf', buildFilterChain(probe?.colorTransfer),
        '-q:v', '3',
      ])
      .format('image2')
      .output(outputPath)
      .on('start', (commandLine) => logger.info('Commande ffmpeg (poster):', commandLine))
      .on('end', () => resolve())
      .on('error', (err) => {
        logger.error('Erreur extraction poster:', err);
        reject(new Error(`Échec de l'extraction du poster: ${err.message}`));
      });
    command.run();
  });

  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Extraction poster timeout')), TIMEOUT_MS);
  });

  try {
    await Promise.race([extraction, timeout]);
  } catch (error) {
    try {
      command?.kill('SIGKILL');
    } catch (killError) {
      logger.warn('Impossible de tuer le processus ffmpeg:', killError);
    }
    await fs.unlink(outputPath).catch(() => {});
    throw error;
  } finally {
    clearTimeout(timer);
  }

  const buffer = await fs.readFile(outputPath);
  await fs.unlink(outputPath).catch((err) =>
    logger.warn('Erreur suppression du poster temporaire:', err)
  );

  logger.info(`Poster généré: ${fileName} (${Math.round(buffer.length / 1024)} Ko)`);
  return { buffer, fileName };
}

/**
 * Valider un fichier vidéo uploadé.
 * Renvoie le `probe` en cas de succès : le contrôleur le réutilise pour le
 * transcodage, ce qui évite un second aller-retour ffprobe.
 */
async function validateVideoFile(file, maxSizeMB = VIDEO_CONFIG.maxSizeMB) {
  if (!file) {
    return { valid: false, error: 'Aucun fichier vidéo fourni' };
  }

  if (!validateMagicBytes(file.path)) {
    return {
      valid: false,
      error: 'Fichier invalide. Seules les vraies vidéos MP4, MOV, AVI sont acceptées.'
    };
  }

  const allowedMimeTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo'];
  if (!allowedMimeTypes.includes(file.mimetype)) {
    return {
      valid: false,
      error: 'Format de fichier non supporté. Formats acceptés: MP4, MOV, AVI'
    };
  }

  const sizeInMB = file.size / (1024 * 1024);
  if (sizeInMB > maxSizeMB) {
    return {
      valid: false,
      error: `Vidéo trop lourde (${Math.round(sizeInMB)} Mo, maximum ${maxSizeMB} Mo). Filme en 1080p plutôt qu'en 4K, ou raccourcis la séquence.`
    };
  }

  // `module.exports.probeVideo` et non `probeVideo` : la référence passe par
  // l'objet exporté, ce qui rend la fonction remplaçable en test.
  let probe = null;
  try {
    probe = await module.exports.probeVideo(file.path);
  } catch (error) {
    logger.warn('Impossible de lire les métadonnées vidéo:', error);
    // Pas critique : le transcodage échouera proprement si le fichier est cassé.
  }

  if (probe?.duration && probe.duration > VIDEO_CONFIG.maxDurationS) {
    return {
      valid: false,
      error: `Vidéo trop longue (${Math.round(probe.duration)} s, maximum ${VIDEO_CONFIG.maxDurationS} s). Garde uniquement le mouvement.`
    };
  }

  return { valid: true, probe };
}

module.exports = {
  convertVideoToGif, // DEPRECATED — plus aucun appelant, retrait en phase 4
  validateVideoFile,
  probeVideo,
  transcodeToMp4,
  extractPoster,
  GIF_CONFIG,
  VIDEO_CONFIG,
};
