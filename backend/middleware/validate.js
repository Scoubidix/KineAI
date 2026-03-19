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
  email: z.string().email(),
  phone: z.string().max(20),
  goals: z.string().max(2000),
});

const updatePatientSchema = z.object({
  firstName: trimmedString(100),
  lastName: trimmedString(100),
  birthDate: z.string().min(1),
  email: z.string().email(),
  phone: z.string().max(20),
  goals: z.string().max(2000),
});

// ========== KINE ==========

const createKineSchema = z.object({
  uid: trimmedString(128),
  email: z.string().email(),
  firstName: trimmedString(100),
  lastName: trimmedString(100),
  acceptedCguAt: z.string().optional(),
  acceptedPolitiqueConfidentialiteAt: z.string().optional(),
  cguVersion: optionalTrimmedString(20),
  politiqueConfidentialiteVersion: optionalTrimmedString(20),
  website: z.string().optional(), // honeypot — accepte pour que le controller le detecte
});

const updateKineProfileSchema = z.object({
  email: z.string().email().optional(),
  phone: optionalTrimmedString(20),
  adresseCabinet: optionalTrimmedString(500),
  rpps: optionalTrimmedString(20),
});

// ========== PROGRAMME ==========

const exerciceItemSchema = z.object({
  exerciceId: positiveInt(),
  series: positiveInt(),
  repetitions: positiveInt(),
  tempsRepos: z.number().int().min(0),
  tempsTravail: z.number().int().min(0).optional(),
  instructions: z.string().max(1000).optional(),
});

const createProgrammeSchema = z.object({
  titre: trimmedString(255),
  description: z.string().max(5000),
  duree: positiveInt(),
  patientId: positiveInt(),
  dateFin: z.string().min(1),
  exercises: z.array(exerciceItemSchema).min(1),
});

const updateProgrammeSchema = z.object({
  titre: trimmedString(255),
  description: z.string().max(5000),
  duree: positiveInt(),
  exercises: z.array(exerciceItemSchema),
});

// ========== EXERCICE MODELE ==========

const createExerciceSchema = z.object({
  nom: trimmedString(255),
  description: z.string().max(2000),
  tags: z.string().max(500).nullable().optional(),
  gifPath: z.string().max(500).nullable().optional(),
});

const updateExerciceSchema = z.object({
  nom: trimmedString(255).optional(),
  description: z.string().max(2000).optional(),
  tags: z.string().max(500).nullable().optional(),
  gifPath: z.string().max(500).nullable().optional(),
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

module.exports = {
  validate,
  createPatientSchema,
  updatePatientSchema,
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
};
