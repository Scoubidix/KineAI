'use client';
import type { BilanPatch, BilanRecord } from '@/types/bilan';

// flush() renvoie Promise<boolean> (cf. useBilanAutosave) : true si tout est persisté
export interface DocumentStepProps { record: BilanRecord; update: (patch: BilanPatch) => void; flush: () => Promise<boolean>; replaceRecord: (r: BilanRecord) => void; disabled?: boolean; onBack: () => void }

// Provisoire : implémenté à la tâche 6
export default function DocumentStep(_props: DocumentStepProps) {
  return null;
}
