'use client';

// Bulle d'attente animée du chat unifié : points qui rebondissent + phrases
// qui défilent en fondu pendant le routage/recherche RAG, puis tient la
// dernière phrase jusqu'à l'arrivée du premier token.
import React, { useEffect, useState } from 'react';

const PHRASES = [
  'Analyse de votre question…',
  'Recherche des études dans la base documentaire…',
  'Analyse des sources…',
  'Synthèse des informations…',
  'Rédaction de la réponse…',
];

const PHRASE_INTERVAL_MS = 1600;
const FADE_MS = 200;

export function ThinkingIndicator() {
  const [index, setIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    // Tient la dernière phrase une fois atteinte
    if (index >= PHRASES.length - 1) return;

    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(() => {
        setIndex((i) => Math.min(i + 1, PHRASES.length - 1));
        setIsVisible(true);
      }, FADE_MS);
    }, PHRASE_INTERVAL_MS);

    return () => clearTimeout(timer);
  }, [index]);

  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-3 bg-muted/50 border border-border/40 rounded-2xl rounded-bl-md px-4 py-2.5 shadow-sm">
        <div className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-[#3899aa] animate-bounce" />
          <span className="h-1.5 w-1.5 rounded-full bg-[#3899aa] animate-bounce [animation-delay:150ms]" />
          <span className="h-1.5 w-1.5 rounded-full bg-[#3899aa] animate-bounce [animation-delay:300ms]" />
        </div>
        <span
          className={`text-sm text-muted-foreground transition-opacity duration-200 ${
            isVisible ? 'opacity-100' : 'opacity-0'
          }`}
        >
          {PHRASES[index]}
        </span>
      </div>
    </div>
  );
}
