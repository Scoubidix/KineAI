'use client';
import { useEffect, useState } from 'react';

// Vrai quand la fenêtre est au moins large de `px` (deux colonnes de l'éditeur dès 1024)
export function useMinWidth(px: number): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${px}px)`);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [px]);
  return matches;
}
