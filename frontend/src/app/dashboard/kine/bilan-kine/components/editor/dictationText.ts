// Insertion du texte dicté dans les notes : fonctions pures, sans React ni DOM.

/** Espaces multiples réduits, bords nettoyés. */
export const cleanSegment = (text: string): string => text.replace(/\s+/g, ' ').trim();

/**
 * Séparateur avant un texte inséré à `pos` : rien en tout début, un saut de ligne au début d'une
 * prise ajoutée en fin de notes non vides, sinon un espace si le caractère précédent n'est pas un blanc.
 */
export function separatorFor(notes: string, pos: number, isTakeStart: boolean): string {
  if (pos === 0) return '';
  const prev = notes[pos - 1];
  if (isTakeStart && pos === notes.length && notes.trim() !== '') return prev === '\n' ? '' : '\n';
  return /\s/.test(prev) ? '' : ' ';
}

/** Insère `text` à `pos` ; renvoie les notes et la nouvelle ancre (fin du texte inséré). */
export function insertSegment(notes: string, pos: number, text: string, isTakeStart: boolean): { notes: string; pos: number } {
  const clean = cleanSegment(text);
  if (!clean) return { notes, pos };
  const p = Math.min(Math.max(pos, 0), notes.length);
  const inserted = separatorFor(notes, p, isTakeStart) + clean;
  return { notes: notes.slice(0, p) + inserted + notes.slice(p), pos: p + inserted.length };
}

/**
 * Le kiné a édité les notes pendant la dictée : si la modification commence avant l'ancre,
 * l'ancre se décale de la différence de longueur ; sinon elle ne bouge pas.
 */
export function shiftAnchor(prev: string, next: string, pos: number): number {
  if (prev === next) return pos;
  const n = Math.min(prev.length, next.length);
  let i = 0;
  while (i < n && prev[i] === next[i]) i += 1;
  if (i >= pos) return pos;
  return Math.max(0, pos + (next.length - prev.length));
}

/**
 * Segments insérables maintenant : contigus à partir de `nextIndex`, un échec définitif étant sauté.
 * Renvoie les textes dans l'ordre et le prochain index attendu.
 */
export function drainReady(nextIndex: number, results: Map<number, string>, failed: Set<number>): { texts: string[]; nextIndex: number } {
  const texts: string[] = [];
  let i = nextIndex;
  while (results.has(i) || failed.has(i)) {
    if (results.has(i)) texts.push(results.get(i) as string);
    i += 1;
  }
  return { texts, nextIndex: i };
}
