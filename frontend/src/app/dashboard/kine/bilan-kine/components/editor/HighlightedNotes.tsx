'use client';
import React, { useMemo } from 'react';
import { findQuoteRanges } from './suggestions';

interface HighlightedNotesProps { notes: string; quotes: { id: string; quote: string }[]; activeId: string | null; onSelect: (id: string) => void }

// Notes en lecture seule avec les extraits cités surlignés (desktop). Clic sur un extrait → focus du candidat.
export default function HighlightedNotes({ notes, quotes, activeId, onSelect }: HighlightedNotesProps) {
  const nfd = useMemo(() => notes.normalize('NFD'), [notes]);
  const ranges = useMemo(() => findQuoteRanges(notes, quotes), [notes, quotes]);
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const r of ranges) {
    if (r.start > cursor) parts.push(nfd.slice(cursor, r.start));
    parts.push(
      <mark key={`${r.id}-${r.start}`} id={`quote-${r.id}`} onClick={() => onSelect(r.id)} className={`cursor-pointer rounded px-0.5 ${activeId === r.id ? 'bg-[#3899aa]/40 ring-1 ring-[#3899aa]' : 'bg-[#3899aa]/15'}`}>
        {nfd.slice(r.start, r.end)}
      </mark>,
    );
    cursor = r.end;
  }
  if (cursor < nfd.length) parts.push(nfd.slice(cursor));
  return <>{parts}</>;
}
