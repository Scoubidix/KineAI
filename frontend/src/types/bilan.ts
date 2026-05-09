export type BilanType = 'INITIAL' | 'INTERMEDIAIRE' | 'FINAL';

export type CanonicalFieldType = 'NUMERIC' | 'BOOLEAN' | 'TEXT' | 'ENUM';

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
}

// Une valeur peut être null = "ajoutée mais non encore saisie / explicitement vidée"
// → ne sera PAS envoyée à l'IA. Les vraies valeurs (0, false, '') sont envoyées.
export type CanonicalValue = number | boolean | string | null;

export interface CustomMeasurement {
  label: string;
  value: string;
}

export interface StructuredData {
  canonical: Record<string, CanonicalValue>;
  custom: CustomMeasurement[];
}

export const EMPTY_STRUCTURED_DATA: StructuredData = { canonical: {}, custom: [] };

export const BILAN_TYPE_LABELS: Record<BilanType, string> = {
  INITIAL: 'Initial',
  INTERMEDIAIRE: 'Intermédiaire',
  FINAL: 'Final',
};

export const BILAN_TYPE_COLORS: Record<BilanType, { bg: string; text: string; border: string }> = {
  INITIAL: { bg: 'bg-blue-500/10', text: 'text-blue-600 dark:text-blue-400', border: 'border-blue-500/30' },
  INTERMEDIAIRE: { bg: 'bg-orange-500/10', text: 'text-orange-600 dark:text-orange-400', border: 'border-orange-500/30' },
  FINAL: { bg: 'bg-green-500/10', text: 'text-green-600 dark:text-green-400', border: 'border-green-500/30' },
};
