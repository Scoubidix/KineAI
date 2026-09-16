// Vocabulaire signalé par les kinés : normalisation, gardes, écriture et lecture.
// Ce qui entre ici est du vocabulaire métier, jamais du contenu clinique : les gardes
// ci-dessous refusent les noms et les phrases, et rien d'autre n'est stocké.
const { DraftError } = require('./bilanDraftService');

/** Bornes de la spec : un terme, pas une phrase. */
const MAX_CHARS = 80;
const MAX_WORDS = 4;

/** Repli : accents retirés, minuscules, ponctuation en espace, espaces compactés.
 *  Le trait d'union est conservé — « Sauvé-Kapandji » est un seul terme. */
function normalizeTerm(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[.,;:!?()«»"'']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Valide une paire et renvoie ses quatre formes. Lève une DraftError sinon. */
function validateTerm({ heard, expected }) {
  const h = String(heard ?? '').trim();
  const e = String(expected ?? '').trim();
  const tooLong = () => new DraftError('TERM_TOO_LONG', 400, 'Sélectionne un terme, pas une phrase');
  if (h.length > MAX_CHARS || e.length > MAX_CHARS) throw tooLong();

  const heardNorm = normalizeTerm(h);
  const expectedNorm = normalizeTerm(e);
  if (!heardNorm || !expectedNorm) throw new DraftError('VALIDATION_ERROR', 400, 'Terme vide');
  if (heardNorm.split(' ').length > MAX_WORDS || expectedNorm.split(' ').length > MAX_WORDS) throw tooLong();
  if (heardNorm === expectedNorm) throw new DraftError('VALIDATION_ERROR', 400, 'Le terme attendu est identique à celui entendu');
  // Le vocabulaire ne porte pas de nombres : ils sont déjà protégés par les gardes du correcteur
  if (/^[\d\s.,-]+$/.test(expectedNorm)) throw new DraftError('VALIDATION_ERROR', 400, 'Un nombre n\'est pas un terme');

  return { heard: h, expected: e, heardNorm, expectedNorm };
}

/**
 * Refuse toute forme qui porte une identité. Le pseudonymiseur du bilan sait masquer le patient
 * et le kiné : si le texte masqué diffère de l'original, c'est qu'il contenait une identité.
 * Un faux positif (rare) coûte un refus au kiné, jamais une fuite en base.
 */
function assertNoIdentity(pseudo, ...values) {
  for (const v of values) {
    if (pseudo.mask(v) !== v) throw new DraftError('IDENTITY_IN_TERM', 400, 'Les noms ne sont pas collectés : signale seulement le terme technique');
  }
}

module.exports = { MAX_CHARS, MAX_WORDS, normalizeTerm, validateTerm, assertNoIdentity };
