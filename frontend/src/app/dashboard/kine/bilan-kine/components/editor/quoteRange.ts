// Repère une citation dans les notes à la casse, aux accents et aux espaces près, et rend ses bornes
// dans le texte d'origine (même comparaison que le serveur : `normalizeText`, bilanEvidence.js).
const fold = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function findQuoteRange(text: string, quote: string): [number, number] | null {
  const chars: string[] = [];
  const origin: number[] = [];
  let prevSpace = false;
  for (let i = 0; i < text.length; i++) {
    if (/\s/.test(text[i])) {
      if (!prevSpace && chars.length > 0) { chars.push(' '); origin.push(i); }
      prevSpace = true;
      continue;
    }
    prevSpace = false;
    for (const f of fold(text[i])) { chars.push(f); origin.push(i); }
  }
  const needle = fold(quote).replace(/\s+/g, ' ').trim();
  if (!needle) return null;
  const at = chars.join('').indexOf(needle);
  if (at === -1) return null;
  return [origin[at], origin[at + needle.length - 1] + 1];
}
