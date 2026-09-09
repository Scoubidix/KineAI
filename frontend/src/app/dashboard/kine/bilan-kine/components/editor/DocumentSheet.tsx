'use client';
import React, { useEffect, useMemo, useState } from 'react';
import DOMPurify from 'dompurify';
import { Loader2 } from 'lucide-react';
import { fetchBilanRender } from '@/utils/bilanExport';
import SectionBlock from './SectionBlock';
import { BILAN_SECTION_KEYS, BILAN_SECTION_TITLES, type AiBusy, type BilanDocument, type BilanSectionKey, type SectionWarnings } from '@/types/bilan';

interface DocumentSheetProps {
  bilanId: number;
  /** Change à chaque sauvegarde : déclenche le rafraîchissement des parties rendues par le serveur */
  refreshKey: string;
  evolution: boolean;
  doc: BilanDocument;
  onSectionChange: (key: BilanSectionKey, text: string) => void;
  disabled?: boolean;
  canRegenerate: boolean;
  onRegenerate: (key: BilanSectionKey) => void;
  aiBusy: AiBusy;
  warnings: SectionWarnings;
  onDismissWarning: (key: BilanSectionKey) => void;
}

interface RenderedParts { header: string; title: string; patient: string; examen: string; observations: string }

// Extrait du rendu serveur les parties non éditables (en-tête, titre, patient, tableaux, repli
// d'observations) : la page affiche exactement ce que le PDF imprimera, sans dupliquer le moteur.
function extractParts(html: string, examenHtml: string): RenderedParts {
  const root = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const pick = (selector: string) => root.querySelector(selector)?.outerHTML ?? '';
  return {
    header: pick('.bilan-header'),
    title: root.querySelector('.bilan-title')?.textContent ?? '',
    patient: pick('.bilan-patient'),
    examen: examenHtml,
    observations: pick('.bilan-observations'),
  };
}

const sanitize = (html: string) => DOMPurify.sanitize(html);

// La page du bilan telle qu'elle sera imprimée : parties fixes rendues par le serveur,
// paragraphes des sections éditables en place.
export default function DocumentSheet({ bilanId, refreshKey, evolution, doc, onSectionChange, disabled, canRegenerate, onRegenerate, aiBusy, warnings, onDismissWarning }: DocumentSheetProps) {
  const [parts, setParts] = useState<RenderedParts | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetchBilanRender(bilanId, { evolution })
      .then((r) => { if (!cancelled) setParts(extractParts(r.html, r.examenHtml)); })
      .catch((e: Error) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [bilanId, refreshKey, evolution]);

  const textByKey = useMemo(() => new Map(doc.sections.map((s) => [s.key, s.text])), [doc.sections]);
  const examenText = (textByKey.get('examen') ?? '').trim();

  return (
    <div className="bilan-page bilan-preview bilan mx-auto w-full max-w-[794px] rounded-sm bg-white text-[#111] shadow-md ring-1 ring-black/5 px-6 py-8 sm:px-12 sm:py-12">
      {error && <p className="text-sm text-destructive mb-3">{error}</p>}
      {parts === null && !error && <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-[#3899aa]" /></div>}
      {parts && (
        <>
          <div dangerouslySetInnerHTML={{ __html: sanitize(parts.header) }} />
          <h1 className="bilan-title">{parts.title}</h1>
          {parts.patient ? <div dangerouslySetInnerHTML={{ __html: sanitize(parts.patient) }} /> : <div className="bilan-patient italic text-muted-foreground">Patient : à associer avant l’enregistrement</div>}
        </>
      )}
      {BILAN_SECTION_KEYS.map((key) => (
        <SectionBlock
          key={key}
          sectionKey={key}
          title={BILAN_SECTION_TITLES[key]}
          text={textByKey.get(key) ?? ''}
          onChange={(t) => onSectionChange(key, t)}
          disabled={disabled}
          canRegenerate={canRegenerate}
          onRegenerate={() => onRegenerate(key)}
          regenerating={aiBusy === key}
          warning={warnings[key]}
          onDismissWarning={() => onDismissWarning(key)}
          before={key === 'examen' && parts ? (
            <>
              {parts.examen && <div dangerouslySetInnerHTML={{ __html: sanitize(parts.examen) }} />}
              {!examenText && parts.observations && <div className="bilan-fallback" dangerouslySetInnerHTML={{ __html: sanitize(parts.observations) }} />}
            </>
          ) : undefined}
        />
      ))}
    </div>
  );
}
