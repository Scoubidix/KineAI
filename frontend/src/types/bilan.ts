export type BilanType = 'INITIAL' | 'INTERMEDIAIRE' | 'FINAL';

export type BilanStatus = 'BROUILLON' | 'GENERE' | 'ENREGISTRE';

export const BILAN_STATUS_LABELS: Record<BilanStatus, string> = {
  BROUILLON: 'Brouillon',
  GENERE: 'Rédigé',
  ENREGISTRE: 'Enregistré',
};

// Une valeur peut être null = "ajoutée mais non encore saisie / explicitement vidée"
// → ne sera PAS envoyée à l'IA. Les vraies valeurs (0, false, '') sont envoyées.
export type CanonicalValue = number | boolean | string | null;

// ==================== DOCUMENT V1 ====================
// Miroir de backend/services/bilanDocument.js (source de vérité stockée dans BilanKine.document)

export type Side = 'D' | 'G';
export type Presentation = 'table' | 'narrative';
export type Origin = 'manual' | 'extracted' | 'previous';

export const BILAN_SECTION_KEYS = ['anamnese', 'antecedents', 'examen', 'limitations', 'diagnostic', 'objectifs', 'traitement'] as const;
export type BilanSectionKey = (typeof BILAN_SECTION_KEYS)[number];

export const BILAN_SECTION_TITLES: Record<BilanSectionKey, string> = {
  anamnese: 'Identification & anamnèse',
  antecedents: 'Antécédents',
  examen: 'Examen clinique',
  limitations: 'Limitations fonctionnelles',
  diagnostic: 'Diagnostic kinésithérapique',
  objectifs: 'Objectifs',
  traitement: 'Traitement',
};

export interface BilanSection {
  key: BilanSectionKey;
  text: string;
}

export type DocumentMeasurement =
  | { kind: 'canonical'; key: string; value: CanonicalValue; side?: Side; presentation: Presentation; origin: Origin }
  | { kind: 'custom'; label: string; value: string; presentation: Presentation; origin: Origin };

export interface BilanDocument {
  schemaVersion: 1;
  sections: BilanSection[];
  measurements: DocumentMeasurement[];
  comparison?: { previousBilanIds: number[] };
  /** Empreinte des mesures en prose à la dernière écriture de l'examen (spec 2026-09-23 §6) */
  proseBasis?: string[];
}

export const emptyBilanDocument = (): BilanDocument => ({
  schemaVersion: 1,
  sections: BILAN_SECTION_KEYS.map((key) => ({ key, text: '' })),
  measurements: [],
});

/** Empreinte des mesures en prose renseignées. Même algorithme que `proseSignatures` côté serveur (`backend/services/bilanDocument.js`) : garder les deux identiques. */
export const proseSignatures = (measurements: DocumentMeasurement[]): string[] =>
  measurements
    .filter((m) => m.presentation === 'narrative' && m.value !== null && m.value !== undefined && !(typeof m.value === 'string' && m.value.trim() === ''))
    .map((m) => `${m.kind === 'canonical' ? `c:${m.key}:${m.side ?? ''}` : `x:${m.label.trim().toLowerCase()}`}=${JSON.stringify(m.value)}`)
    .sort();

/** Vrai si une mesure en prose a été ajoutée ou modifiée depuis la dernière écriture d'un examen non vide. Sans empreinte (bilan rédigé avant 2026-09-23) : faux. */
export const isProseOutdated = (doc: BilanDocument): boolean => {
  if (!doc.proseBasis) return false;
  if ((doc.sections.find((s) => s.key === 'examen')?.text ?? '').trim() === '') return false;
  return proseSignatures(doc.measurements).join('\n') !== doc.proseBasis.join('\n');
};

// ==================== RESSOURCE /api/bilans (plan 2) ====================

export interface PatientSummary {
  id: number;
  firstName: string;
  lastName: string;
  birthDate?: string;
}

export interface BilanRecord {
  id: number;
  status: BilanStatus;
  type: BilanType;
  motif: string | null;
  rawNotes: string | null;
  document: BilanDocument | null; // null = bilan hérité (bilanHtml)
  bilanHtml: string | null;
  patientId: number | null;
  patient: PatientSummary | null;
  createdAt: string;
  updatedAt: string;
}

export interface BilanListItem {
  id: number;
  status: BilanStatus;
  type: BilanType;
  motif: string | null;
  updatedAt: string;
  createdAt: string;
  patient: Pick<PatientSummary, 'id' | 'firstName' | 'lastName'> | null;
  job: { status: BilanJobStatus; progress: number | null } | null;
}

// ==================== DICTÉE : TRAITEMENT CÔTÉ SERVEUR (plan 7) ====================
export type BilanJobStatus = 'RECORDING' | 'TRANSCRIBING' | 'CORRECTING' | 'COMPOSING' | 'DONE' | 'FAILED';

export type BilanJobKind = 'DICTATION' | 'SESSION';

/** Ce que renvoyait « Rédiger avec l'IA » en direct, conservé par le serveur pour rouvrir le tiroir « à vérifier » */
/**
 * Un remplacement appliqué par la passe de correction : ce que Whisper avait écrit, ce que le
 * kiné lit. Jamais montré — il ne doit pas savoir qu'un correcteur passe derrière lui. Sert à
 * reconnaître, si le kiné signale ce terme, qu'il porte sur notre sortie et non sur la sienne.
 */
export interface DictationChange { from: string; to: string }

export interface BilanJobResult {
  accepted: { id: string; quote: string }[];
  pending: ExtractionCandidate[];
  rejected: number;
  warnings: SectionWarnings;
  corrections?: DictationChange[];
}

export interface BilanJobView {
  id: number;
  bilanId: number;
  kind: BilanJobKind;
  status: BilanJobStatus;
  segmentsTotal: number | null;
  segmentsDone: number;
  segmentsFailed: number;
  segmentsQueued: number;
  nextIndex: number;
  progress: number | null;
  error: string | null;
  errorDetail: Record<string, unknown> | null;
  result: BilanJobResult | null;
  consentAt: string | null;
  updatedAt: string;
  finishedAt: string | null;
}

export type BilanPatch = Partial<Pick<BilanRecord, 'rawNotes' | 'motif' | 'type' | 'document'>>;

export type CanonicalFieldType = 'NUMERIC' | 'BOOLEAN' | 'TEXT' | 'ENUM';

// ==================== IA (plan 3) ====================

/** Candidat renvoyé par POST /api/bilans/:id/extract, déjà normalisé côté serveur (jamais écrit sans validation). */
export interface ExtractionCandidate {
  /** Même identité que les mesures : `c:<key>:<side|''>` ou `x:<label normalisé>` */
  id: string;
  kind: 'canonical' | 'custom';
  key?: string;
  label: string;
  fieldType: CanonicalFieldType;
  unit: string | null;
  lateralized: boolean;
  value: CanonicalValue;
  side: Side | null;
  presentation: Presentation;
  /** Extrait exact des notes qui justifie la valeur */
  quote: string;
  confidence: number;
  status: 'new' | 'conflict';
  existingValue?: CanonicalValue;
  warning?: 'out_of_range';
}

export interface ExtractionResult { candidates: ExtractionCandidate[]; rejected: number }

export type SectionWarning = 'unverified_number' | 'table_duplicate' | 'measures_changed';
export type SectionWarnings = Partial<Record<BilanSectionKey, SectionWarning>>;

export interface ComposeResult { bilan: BilanRecord; warnings: SectionWarnings }

/** Réponse de « Rédiger avec l'IA » : bilan rédigé, mesures acceptées (avec leur citation) et candidats en suspens */
export interface ComposeFromNotesResult {
  bilan: BilanRecord;
  warnings: SectionWarnings;
  accepted: { id: string; quote: string }[];
  pending: ExtractionCandidate[];
  rejected: number;
}

/** Appel IA en cours dans l'éditeur : extraction, rédaction complète (depuis les notes ou non), ou régénération d'une section */
export type AiBusy = null | 'extract' | 'compose' | 'compose_from_notes' | BilanSectionKey;

export interface CanonicalField {
  id: number;
  key: string;
  label: string;
  type: CanonicalFieldType;
  unit: string | null;
  rangeMin: number | null;
  rangeMax: number | null;
  options: string[] | null;
  category: string;
  order: number;
  isActive: boolean;
  aliases: string[];
  lateralized: boolean;
  presentation: 'TABLE' | 'NARRATIVE';
  description: string | null;
  /** Une fiche pratique avec description existe (bouton ⓘ). Absent des réponses admin. */
  hasGuide?: boolean;
}

/** Fiche pratique d'un test, lue par le kiné (GET /api/bilan-guides/:key) */
export interface TestGuide {
  fieldKey: string;
  label: string;
  category: string;
  content: string;
  youtubeId: string | null;
  youtubeStart: number | null;
}

/** Fiche vue par l'admin */
export interface AdminBilanGuide {
  content: string;
  youtubeId: string | null;
  youtubeStart: number | null;
  updatedAt: string;
  updatedBy: string | null;
}

/** Ligne de l'onglet admin « Fiches tests » : un test actif du catalogue et sa fiche éventuelle */
export interface AdminBilanGuideRow {
  fieldKey: string;
  label: string;
  category: string;
  order: number;
  guide: AdminBilanGuide | null;
}

// ⚠️ Hérité : sert uniquement à lire structuredData des bilans antérieurs à la V1. Les nouveaux bilans utilisent BilanDocument.
export interface CanonicalMeasurement {
  kind: 'canonical';
  key: string;
  value: CanonicalValue;
}

export interface CustomMeasurement {
  kind: 'custom';
  label: string;
  value: string;
}

export type Measurement = CanonicalMeasurement | CustomMeasurement;

// Liste plate ordonnée. L'ordre est la source de vérité unique pour l'affichage
// (l'ordre des catégories est dérivé de la première apparition de chaque cat
// dans measurements).
export interface StructuredData {
  measurements: Measurement[];
}

/**
 * Libellés d'affichage. Ils se suffisent à eux-mêmes (« Bilan initial ») : partout côté front, le
 * type est montré seul — pastille, filtre, menu — et « Initial » sans son nom ne veut rien dire.
 * Le backend garde ses propres libellés courts (`bilanRenderer/format.js`) : là-bas ils sont des
 * fragments de phrase, composés en « BILAN KINÉSITHÉRAPIQUE INITIAL » et « Bilan Initial - Nom ».
 */
export const BILAN_TYPE_LABELS: Record<BilanType, string> = {
  INITIAL: 'Bilan initial',
  INTERMEDIAIRE: 'Bilan intermédiaire',
  FINAL: 'Bilan final',
};

export const BILAN_TYPE_COLORS: Record<BilanType, { bg: string; text: string; border: string }> = {
  INITIAL: { bg: 'bg-blue-500/10', text: 'text-blue-600 dark:text-blue-400', border: 'border-blue-500/30' },
  INTERMEDIAIRE: { bg: 'bg-orange-500/10', text: 'text-orange-600 dark:text-orange-400', border: 'border-orange-500/30' },
  FINAL: { bg: 'bg-green-500/10', text: 'text-green-600 dark:text-green-400', border: 'border-green-500/30' },
};

// ==================== TEMPLATES ====================
// Un template = liste ordonnée d'items (canoniques + customs) pour pré-remplir
// la composition de structuredData d'un bilan, sans valeur initiale.

export type TemplateItem =
  | { kind: 'canonical'; key: string }
  | { kind: 'custom'; label: string };

export interface BilanTemplate {
  id: number;
  name: string;
  description: string | null;
  category: string;
  items: TemplateItem[];
  isPublic: boolean;
  kineId: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
