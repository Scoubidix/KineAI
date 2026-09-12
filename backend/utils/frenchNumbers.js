// Conversion des nombres écrits en toutes lettres (0 à 999, composés avec « mille ») en chiffres,
// pour comparer un dialogue transcrit (locuteurs qui parlent en lettres) aux notes rédigées par
// le modèle (qui écrit toujours en chiffres). Volontairement limité au vocabulaire courant d'un
// bilan kiné ; ne traite pas les fractions, ordinaux ou nombres négatifs.
const UNITS = {
  zéro: 0, zero: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9,
  dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16,
};
const TENS = { vingt: 20, vingts: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60 };

// Unités connues après lesquelles « un »/« une » sont bien un nombre (et non l'article indéfini).
const KNOWN_UNITS_RE = /(?:degrés?|centimètres?|cm|secondes?|fois|sur|mois|semaines?|ans?|jours?)\b/i;

// Vocabulaire des mots-nombres reconnus dans un groupe (hors « un »/« une », traités à part).
const NUMBER_WORD = '(?:z[ée]ro|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize|vingts?|trente|quarante|cinquante|soixante|cents?|mille|et)';
const RUN_RE = new RegExp(`\\b${NUMBER_WORD}(?:[ -]${NUMBER_WORD})*\\b`, 'gi');

/** 0-99 : « quatre-vingt(s) » multiplie, un mot-nombre après une dizaine s'additionne. */
function parseSub100(tokens) {
  let i = 0;
  let value;
  if (tokens[i] === 'quatre' && (tokens[i + 1] === 'vingt' || tokens[i + 1] === 'vingts')) {
    value = 80; i += 2;
  } else if (TENS[tokens[i]] !== undefined) {
    value = TENS[tokens[i]]; i += 1;
  } else if (UNITS[tokens[i]] !== undefined) {
    value = UNITS[tokens[i]]; i += 1;
  } else {
    return null;
  }
  if (tokens[i] === 'et') i += 1;
  if (tokens[i] !== undefined) {
    if (UNITS[tokens[i]] === undefined) return null;
    value += UNITS[tokens[i]]; i += 1;
  }
  return i === tokens.length ? value : null;
}

/** 0-999 : « cent(s) » multiplié par un chiffre 1-9 optionnel, puis un reste 0-99. */
function parseUpTo999(tokens) {
  const centIndex = tokens.findIndex((t) => t === 'cent' || t === 'cents');
  if (centIndex === -1) return parseSub100(tokens);
  const before = tokens.slice(0, centIndex);
  let mult = 1;
  if (before.length) {
    if (before.length !== 1 || UNITS[before[0]] === undefined) return null;
    mult = UNITS[before[0]];
  }
  let after = tokens.slice(centIndex + 1);
  if (after[0] === 'et') after = after.slice(1);
  const rest = after.length ? parseSub100(after) : 0;
  if (rest === null) return null;
  return mult * 100 + rest;
}

/** Nombre complet, composé avec « mille » : groupe de milliers, puis reste 0-999. */
function parseFullNumber(tokens) {
  const milleIndex = tokens.indexOf('mille');
  if (milleIndex === -1) return parseUpTo999(tokens);
  const before = tokens.slice(0, milleIndex);
  let mult = 1;
  if (before.length) {
    mult = parseUpTo999(before);
    if (mult === null) return null;
  }
  let after = tokens.slice(milleIndex + 1);
  if (after[0] === 'et') after = after.slice(1);
  const rest = after.length ? parseUpTo999(after) : 0;
  if (rest === null) return null;
  return mult * 1000 + rest;
}

/**
 * Convertit les nombres écrits en toutes lettres d'un texte en chiffres. « un »/« une » ne sont
 * convertis que juste avant une unité connue (article indéfini sinon, jamais un nombre).
 */
function wordsToDigits(text) {
  let out = String(text ?? '');
  out = out.replace(new RegExp(`\\b(un|une)\\b(?=\\s+${KNOWN_UNITS_RE.source})`, 'gi'), '1');
  out = out.replace(RUN_RE, (match) => {
    const tokens = match.toLowerCase().split(/[ -]/);
    const value = parseFullNumber(tokens);
    return value === null ? match : String(value);
  });
  return out;
}

module.exports = { wordsToDigits };
