// utils/uploadedImage.js
// Chaine commune « fichier multer sur disque -> validation magic bytes -> upload GCS ».
// Le fichier temporaire est TOUJOURS nettoye, succes ou echec.
const fs = require('fs');
const { validateImageBuffer } = require('../services/gcsStorageService');
const logger = require('./logger');

/**
 * Supprime le fichier temporaire ecrit par multer, s'il existe encore.
 * Idempotent : appelable plusieurs fois sur le meme req.file.
 * @param {{ path: string }|undefined} file
 */
function cleanupTempFile(file) {
  if (!file?.path) return;
  try {
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
  } catch (e) {
    logger.warn('Nettoyage du fichier temporaire echoue:', e.message);
  }
}

/**
 * @param {{ path: string, originalname: string }|undefined} file - req.file de multer
 * @param {(buffer: Buffer, fileName: string, contentType: string) => Promise<string>} uploadFn
 * @returns {Promise<{ imagePath: string|null, error?: string }>}
 */
async function processUploadedImage(file, uploadFn) {
  if (!file) return { imagePath: null };
  try {
    const fileBuffer = fs.readFileSync(file.path);
    const { valid, detectedType } = validateImageBuffer(fileBuffer);
    if (!valid) {
      return { error: 'Le fichier n\'est pas une image valide (JPEG, PNG ou WebP).' };
    }
    const imagePath = await uploadFn(fileBuffer, file.originalname, detectedType);
    return { imagePath };
  } finally {
    cleanupTempFile(file);
  }
}

module.exports = { processUploadedImage, cleanupTempFile };
