'use client';
import React from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SaveState } from '@/hooks/useBilanAutosave';

interface BilanEditorAlertsProps {
  saveState: SaveState;
  errorMessage: string | null;
  onReload: () => void;
  onRetry: () => void;
}

/**
 * Ce que l'éditeur doit dire sur la sauvegarde : rien quand tout va bien.
 *
 * L'indicateur « Enregistrement… / Enregistré 14h32 » a été retiré : l'autosave se comprend tout
 * seul au bout de deux bilans, et une pastille qui apparaît et disparaît au fil de la frappe
 * déplaçait la page. Ne restent que les deux cas où le kiné doit agir — bilan modifié sur un autre
 * appareil, et sauvegarde impossible. Ces bandeaux n'existent pas tant qu'il n'y a rien à signaler.
 */
export default function BilanEditorAlerts({ saveState, errorMessage, onReload, onRetry }: BilanEditorAlertsProps) {
  if (saveState !== 'stale' && saveState !== 'error') return null;

  return saveState === 'stale' ? (
    <div className="flex items-center justify-between gap-3 bg-amber-50 text-amber-900 text-xs px-4 py-2 border-b border-amber-200">
      <span>Ce bilan a été modifié sur un autre appareil. Recharge pour continuer : tes dernières frappes non enregistrées seront perdues.</span>
      <Button size="sm" variant="outline" onClick={onReload} className="h-7 text-xs shrink-0"><RefreshCw className="h-3 w-3 mr-1" />Recharger</Button>
    </div>
  ) : (
    <div className="flex items-center justify-between gap-3 bg-red-50 text-red-900 text-xs px-4 py-2 border-b border-red-200">
      <span className="flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5 shrink-0" />Sauvegarde impossible : {errorMessage}</span>
      <div className="flex items-center gap-2 shrink-0">
        <Button size="sm" variant="outline" onClick={onRetry} className="h-7 text-xs"><RefreshCw className="h-3 w-3 mr-1" />Réessayer</Button>
        <Button size="sm" variant="outline" onClick={onReload} className="h-7 text-xs">Recharger</Button>
      </div>
    </div>
  );
}
