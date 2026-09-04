const { z } = require('zod');

// Middleware factory : valide req.body avec un schema Zod
const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({
      success: false,
      error: 'Données invalides',
      code: 'VALIDATION_ERROR',
      details: result.error.issues.map(i => ({
        field: i.path.join('.'),
        message: i.message
      }))
    });
  }
  req.body = result.data;
  next();
};

// ========== Helpers ==========

const trimmedString = (max = 255) => z.string().trim().min(1).max(max);
const optionalTrimmedString = (max = 255) => z.string().trim().max(max).optional();
const positiveInt = () => z.number().int().positive();

// ========== PATIENT ==========

const createPatientSchema = z.object({
  firstName: trimmedString(100),
  lastName: trimmedString(100),
  birthDate: z.string().min(1),
  email: z.string().email().optional().or(z.literal('')), // Optionnel : vide ou email valide
  phone: z.string().max(20).optional().or(z.literal('')), // Optionnel : sert au canal WhatsApp
  goals: z.string().max(2000),
});

const updatePatientSchema = z.object({
  firstName: trimmedString(100),
  lastName: trimmedString(100),
  birthDate: z.string().min(1),
  email: z.string().email().optional().or(z.literal('')), // Optionnel : vide ou email valide
  phone: z.string().max(20).optional().or(z.literal('')), // Optionnel : sert au canal WhatsApp
  goals: z.string().max(2000),
});

// Mise à jour ciblée du contact (email et/ou phone) : modal rapide "compléter le contact manquant"
// partagée par les flux Courrier / Programme / Visio. Au moins un des deux champs doit être fourni.
const updatePatientContactSchema = z.object({
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().max(20).optional().or(z.literal('')),
}).refine((d) => d.email !== undefined || d.phone !== undefined, {
  message: 'Au moins un champ (email ou phone) doit être fourni',
});

// ========== KINE ==========

const createKineSchema = z.object({
  uid: trimmedString(128),
  email: z.string().email(),
  acceptedLegalAt: z.string().optional(),   // ISO timestamp, backend remplit les versions
  website: z.string().optional(),            // honeypot — accepte pour que le controller le détecte
});

const updateKineProfileSchema = z.object({
  // Nom et prénom : acceptés (saisis dans l'onboarding wizard et la modal profil).
  // trimmedString applique déjà trim() + min(1) — rejette les chaînes vides ET "   ".
  firstName: trimmedString(100).optional(),
  lastName:  trimmedString(100).optional(),
  email: z.string().email().optional(),
  phone: optionalTrimmedString(20),
  adresseCabinet: optionalTrimmedString(500),
  // Nullable : le front envoie null pour effacer le RPPS (Prisma le stocke en NULL).
  rpps: optionalTrimmedString(20).nullable(),
  // Champs profil étendus pour la génération de contrats
  civilite: z.enum(['M.', 'MME']).nullable().optional(),
  birthDate: z.string().optional().or(z.literal('')),
  birthPlace: optionalTrimmedString(200).or(z.literal('')),
  departementOrdre: optionalTrimmedString(150).or(z.literal('')),
  numeroOrdinal: optionalTrimmedString(50).or(z.literal('')),
  numeroUrssaf: optionalTrimmedString(50).or(z.literal('')),
  adresseDomicile: optionalTrimmedString(500).or(z.literal('')),
});

// ========== PROGRAMME ==========

const exerciceItemSchema = z.object({
  exerciceId: positiveInt(),
  ordre: z.number().int().min(0).optional(),
  series: positiveInt(),
  repetitions: positiveInt(),
  tempsRepos: z.number().int().min(0),
  tempsTravail: z.number().int().min(0).optional(),
  instructions: z.string().max(1000).optional(),
});

// Un programme est une prescription entre deux reevaluations, pas un abonnement :
// au-dela d'un mois, il faut le renouveler plutot que l'etirer.
const PROGRAMME_DUREE_MAX = 30;

const createProgrammeSchema = z.object({
  titre: trimmedString(255),
  description: z.string().max(5000),
  duree: z.number().int().min(1).max(PROGRAMME_DUREE_MAX),
  patientId: positiveInt(),
  // Ni dateDebut ni dateFin : le programme demarre le jour de sa creation et la
  // date de fin est derivee de la duree cote serveur. Les accepter du client
  // rendrait le plafond de duree contournable, puisque c'est dateFin qui pilote
  // l'expiration du jeton patient.
  exercises: z.array(exerciceItemSchema).min(1),
});

const updateProgrammeSchema = z.object({
  titre: trimmedString(255),
  description: z.string().max(5000),
  // Accepte pour compatibilite avec les clients existants, mais NON ecrit par le
  // controleur : les dates d'un programme sont figees a sa creation et la duree
  // les pilote. La modifier apres coup desynchroniserait la periode affichee et
  // l'expiration du jeton patient, deja emis.
  // Volontairement SANS plafond, contrairement a la creation : les programmes
  // anterieurs au plafond peuvent depasser 30 jours, et le valider ici les
  // rendrait definitivement ineditables alors que la valeur est ignoree.
  duree: positiveInt().optional(),
  exercises: z.array(exerciceItemSchema),
});

// ========== EXERCICE MODELE ==========

// Chemins GCS des médias d'un exercice. Deux raisons d'être stricts ici :
//  1. Zod n'est pas en mode strict : un champ absent du schéma est silencieusement
//     retiré du body, le fichier partirait sur GCS sans que son chemin n'atteigne
//     jamais la base.
//  2. Le bucket est UNIQUE (contrats, avatars, support y sont d'autres préfixes)
//     et ces chemins sont recopiés en base puis signés dans la réponse. Sans le
//     cadrage sur `exercices/`, un kiné pourrait faire signer le contrat d'un
//     autre en le déclarant comme la vidéo de son propre exercice.
// Un seul segment après le dossier : c'est la forme produite par
// `uploadExerciceFile` (`exercices/<timestamp>_<nom>`), et ça exclut tout
// échappement vers un autre préfixe.
const exerciceMediaPath = () =>
  z.string()
    .max(500)
    .regex(/^exercices\/[^/]+$/, 'Chemin de média invalide')
    .nullable()
    .optional();

const createExerciceSchema = z.object({
  nom: trimmedString(255),
  description: z.string().max(2000),
  tags: z.string().max(500).nullable().optional(),
  gifPath: exerciceMediaPath(),
  videoPath: exerciceMediaPath(),
  posterPath: exerciceMediaPath(),
});

const updateExerciceSchema = z.object({
  nom: trimmedString(255).optional(),
  description: z.string().max(2000).optional(),
  tags: z.string().max(500).nullable().optional(),
  gifPath: exerciceMediaPath(),
  videoPath: exerciceMediaPath(),
  posterPath: exerciceMediaPath(),
});

// ========== TEMPLATES ==========

const createTemplateSchema = z.object({
  title: trimmedString(255),
  category: trimmedString(100),
  subject: optionalTrimmedString(255),
  body: z.string().min(1).max(10000),
  tags: z.array(z.string().max(50)).optional(),
});

const updateTemplateSchema = z.object({
  title: optionalTrimmedString(255),
  category: optionalTrimmedString(100),
  subject: optionalTrimmedString(255),
  body: z.string().max(10000).optional(),
  tags: z.array(z.string().max(50)).optional(),
});

const personalizeTemplateSchema = z.object({
  templateId: z.union([positiveInt(), z.string().regex(/^\d+$/)]),
  patientId: z.union([positiveInt(), z.string().regex(/^\d+$/)]).optional(),
  contactId: z.union([positiveInt(), z.string().regex(/^\d+$/)]).optional(),
});

const templateHistorySchema = z.object({
  patientId: z.union([positiveInt(), z.string().regex(/^\d+$/)]).nullable().optional(),
  contactId: z.union([positiveInt(), z.string().regex(/^\d+$/)]).nullable().optional(),
  templateId: z.union([positiveInt(), z.string().regex(/^\d+$/)]).nullable().optional(),
  templateTitle: trimmedString(255),
  subject: z.string().max(255),
  body: z.string().min(1).max(10000),
  method: z.enum(['EMAIL', 'WHATSAPP']),
  recipientName: optionalTrimmedString(255),
  recipientEmail: z.string().email().optional(),
});

const sendWhatsappSchema = z.object({
  patientId: z.union([positiveInt(), z.string().regex(/^\d+$/)]),
  templateId: z.union([positiveInt(), z.string().regex(/^\d+$/)]).nullable().optional(),
  templateTitle: trimmedString(255),
  subject: z.string().max(255).optional(),
  body: z.string().min(1).max(10000),
});

// ========== GROUPE PIONNIERS ==========

const pionnierReadSchema = z.object({
  lastReadMessageId: z.number().int().min(0),
});

// POST /api/pionniers/messages arrive en multipart : toutes les valeurs sont des
// CHAINES, et un champ repete devient un TABLEAU (ce qui faisait planter un
// .trim() direct). D'ou la coercition et le refus explicite de tout non-string.
// Ce schema est applique DANS le controller et non via validate(), pour rester
// couvert par le finally qui nettoie le fichier temporaire de multer.
const createPionnierMessageSchema = z.object({
  body: z.string().trim().max(4000).optional().default(''),
  replyToId: z.coerce.number().int().positive().optional(),
});

// Modification d'un message : la citation n'est pas modifiable (elle appartient au
// fil, pas au message), et removeImage arrive en chaine « true »/« false ».
const updatePionnierMessageSchema = z.object({
  body: z.string().trim().max(4000).optional().default(''),
  removeImage: z.enum(['true', 'false']).optional().transform((v) => v === 'true'),
});

module.exports = {
  validate,
  createPatientSchema,
  updatePatientSchema,
  updatePatientContactSchema,
  createKineSchema,
  updateKineProfileSchema,
  createProgrammeSchema,
  updateProgrammeSchema,
  createExerciceSchema,
  updateExerciceSchema,
  createTemplateSchema,
  updateTemplateSchema,
  personalizeTemplateSchema,
  templateHistorySchema,
  sendWhatsappSchema,
  pionnierReadSchema,
  createPionnierMessageSchema,
  updatePionnierMessageSchema,
};
