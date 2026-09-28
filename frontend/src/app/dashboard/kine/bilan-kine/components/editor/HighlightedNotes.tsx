'use client';
import React, { useEffect, useRef } from 'react';
import { findQuoteRange } from './quoteRange';

// Notes du kiné, passage cité surligné et amené à l'écran. Texte rendu par React (échappé) : aucun HTML.
export default function HighlightedNotes({ notes, quote }: { notes: string; quote: string | null }) {
  const markRef = useRef<HTMLElement>(null);
  const range = quote ? findQuoteRange(notes, quote) : null;
  useEffect(() => {
    const reduce = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    markRef.current?.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
  }, [quote]);
  const cls = 'whitespace-pre-wrap break-words text-[15px] leading-[1.7]';
  if (!range) return <p className={cls}>{notes}</p>;
  return (
    <p className={cls}>
      {notes.slice(0, range[0])}
      <mark ref={markRef} className="rounded bg-amber-200 px-0.5 text-inherit dark:bg-amber-500/40">{notes.slice(range[0], range[1])}</mark>
      {notes.slice(range[1])}
    </p>
  );
}
