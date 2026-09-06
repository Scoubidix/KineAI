'use client';
import type { BilanPatch, BilanRecord } from '@/types/bilan';

export interface StepProps { record: BilanRecord; update: (patch: BilanPatch) => void; disabled?: boolean; onBack?: () => void; onNext: () => void }

// Provisoire : implémenté à la tâche 4
export default function CaptureStep(_props: StepProps) {
  return null;
}
