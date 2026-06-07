'use client';

// Bulle d'attente animée du chat unifié : points qui rebondissent + phrases en fondu.
// Démarre sur une phrase générique, puis enchaîne la séquence propre à l'IA routée
// (event SSE `routed`) et tient la dernière phrase jusqu'au premier token.
import React, { useEffect, useMemo, useState } from 'react';

type IaType = 'basique' | 'biblio' | 'clinique';

const GENERIC_PHRASE = 'Analyse de votre question…';

const PHRASES_BY_IA: Record<IaType, string[]> = {
  basique: [
    'Consultation de la base de connaissances…',
    'Préparation d’une réponse claire…',
    'Rédaction de la réponse…',
  ],
  biblio: [
    'Recherche des études dans la base documentaire…',
    'Lecture des publications pertinentes…',
    'Évaluation du niveau de preuve…',
    'Synthèse des résultats…',
    'Rédaction de la réponse…',
  ],
  clinique: [
    'Analyse du tableau clinique…',
    'Recherche des tests et cotations pertinents…',
    'Construction du raisonnement clinique…',
    'Vérification des drapeaux rouges…',
    'Rédaction de la réponse…',
  ],
};

const PHRASE_INTERVAL_MS = 1600;
const FADE_MS = 200;

export function ThinkingIndicator({ iaType }: { iaType: IaType | null }) {
  const [index, setIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(true);

  // Tant que le router n'a pas répondu : phrase générique seule (tenue).
  // Dès que l'IA est connue : la séquence spécifique s'enchaîne.
  const phrases = useMemo(
    () => (iaType ? [GENERIC_PHRASE, ...PHRASES_BY_IA[iaType]] : [GENERIC_PHRASE]),
    [iaType]
  );

  useEffect(() => {
    // Tient la dernière phrase une fois la séquence terminée
    if (index >= phrases.length - 1) return;

    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(() => {
        setIndex((i) => Math.min(i + 1, phrases.length - 1));
        setIsVisible(true);
      }, FADE_MS);
    }, PHRASE_INTERVAL_MS);

    return () => clearTimeout(timer);
  }, [index, phrases]);

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
          {phrases[Math.min(index, phrases.length - 1)]}
        </span>
      </div>
    </div>
  );
}
