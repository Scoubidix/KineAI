const express = require('express');
const router = express.Router();
const { z } = require('zod');
const contractAccessController = require('../controllers/contractAccessController');
const { contractSessionRequired } = require('../middleware/contractSession');
const { validate } = require('../middleware/validate');
const { magicLinkAccessLimiter, magicLinkSignLimiter } = require('../middleware/rateLimiter');

// ========== Routes publiques (pas d'auth Firebase) ==========
// Identifiées par le magic token dans l'URL

const identifySchema = z.object({
  mode: z.enum(['EXISTING_KINE', 'NEW_KINE', 'GUEST']),
  firebaseIdToken: z.string().optional(),
  // Acceptation CGU/PC/DPA — obligatoire à la création d'un compte NEW_KINE (vérifié dans le contrôleur).
  legalAccepted: z.boolean().optional(),
  // Nom/prénom confirmés (ou corrigés) dans la modale d'inscription NEW_KINE. Optionnels :
  // si absents, le backend retombe sur les noms du contrat (saisis par l'initiateur).
  firstName: z.string().trim().max(100).optional(),
  lastName: z.string().trim().max(100).optional(),
});

router.get('/:token', magicLinkAccessLimiter, contractAccessController.getPublicInfo);
router.post('/:token/identify', magicLinkAccessLimiter, validate(identifySchema), contractAccessController.identify);

// ========== Routes session-protected ==========
// Requièrent Bearer <sessionToken> dans l'Authorization header

// On accepte null/undefined/empty string sur tous les champs pour tolérer les profils partiels
// (le Kine destinataire peut arriver avec des champs déjà remplis et d'autres null).
const profileSchema = z.object({
  // firstName / lastName : utilisés uniquement en mode GUEST pour permettre au destinataire
  // de corriger une erreur de saisie de l'initiateur. Ignorés dans les autres modes (le Kine
  // lié au contrat est la source de vérité).
  firstName: z.string().trim().max(100).nullable().optional().or(z.literal('')),
  lastName: z.string().trim().max(100).nullable().optional().or(z.literal('')),
  civilite: z.enum(['M.', 'MME']).nullable().optional(),
  birthDate: z.string().nullable().optional().or(z.literal('')),
  birthPlace: z.string().trim().max(200).nullable().optional().or(z.literal('')),
  departementOrdre: z.string().trim().max(150).nullable().optional().or(z.literal('')),
  numeroOrdinal: z.string().trim().max(50).nullable().optional().or(z.literal('')),
  numeroUrssaf: z.string().trim().max(50).nullable().optional().or(z.literal('')),
  adresseCabinet: z.string().trim().max(500).nullable().optional().or(z.literal('')),
  adresseDomicile: z.string().trim().max(500).nullable().optional().or(z.literal('')),
}).passthrough(); // tolère les champs additionnels (email) sans les utiliser

const signSchema = z.object({
  signatureText: z.string().trim().min(2).max(200),
  mention: z.string().trim().min(1).max(255).optional(),
  // Acceptation CGU/PC obligatoire uniquement en mode GUEST (vérifié dans le contrôleur).
  // Les versions ne sont plus envoyées par le frontend — le backend les remplit depuis
  // legalVersions.js (source unique de vérité).
  legalAcceptance: z.object({}).passthrough().optional(),
});

router.get('/me/context', contractSessionRequired, contractAccessController.getSessionContext);
router.post('/me/profile', contractSessionRequired, validate(profileSchema), contractAccessController.saveProfile);
router.get('/me/preview-pdf', contractSessionRequired, contractAccessController.previewPdf);
router.post('/me/sign', contractSessionRequired, magicLinkSignLimiter, validate(signSchema), contractAccessController.sign);
router.get('/me/final-pdf', contractSessionRequired, contractAccessController.getFinalPdfUrl);

module.exports = router;
