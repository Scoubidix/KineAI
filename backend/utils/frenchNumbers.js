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

// Vocabulaire des mots-nombres reconnus en début de groupe ; « un »/« une » n'y figurent pas (ils ne
// démarrent jamais un groupe seuls, cf. article indéfini) mais sont admis en continuation
// (« vingt et un », « quatre-vingt-un »).
const BASE_WORDS = ['z[ée]ro', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'vingts?', 'trente', 'quarante', 'cinquante', 'soixante', 'cents?', 'mille', 'et'];
const NUMBER_WORD = `(?:${BASE_WORDS.join('|')})`;
const NUMBER_WORD_CONT = `(?:${BASE_WORDS.join('|')}|une?)`;
const RUN_RE = new RegExp(`\\b${NUMBER_WORD}(?:[ -]${NUMBER_WORD_CONT})*\\b`, 'gi');

/** 0-19 à partir d'un reste : soit un mot-nombre unique, soit « dix-sept/huit/neuf » composé. */
function parse0to19(tokens) {
  if (tokens.length === 1) return UNITS[tokens[0]] !== undefined ? UNITS[tokens[0]] : null;
  if (tokens.length === 2 && tokens[0] === 'dix' && ['sept', 'huit', 'neuf'].includes(tokens[1])) {
    return 10 + UNITS[tokens[1]];
  }
  return null;
}

/**
 * 0-99 : dizaine (ou « quatre-vingt(s) ») puis reste 0-19 accolé ou lié par « et ». « et » ne relie
 * que les dizaines (« vingt et un », « soixante et onze ») : jamais deux nombres isolés
 * (« deux et trois » reste deux nombres, géré par l'appelant).
 */
function parseSub100(tokens) {
  let i = 0;
  let value;
  let allowLink = false;
  if (tokens[i] === 'quatre' && (tokens[i + 1] === 'vingt' || tokens[i + 1] === 'vingts')) {
    value = 80; i += 2; allowLink = true;
  } else if (TENS[tokens[i]] !== undefined) {
    value = TENS[tokens[i]]; i += 1; allowLink = true;
  } else if (UNITS[tokens[i]] !== undefined) {
    value = UNITS[tokens[i]]; i += 1;
  } else {
    return null;
  }
  let rest = tokens.slice(i);
  if (rest[0] === 'et') {
    if (!allowLink) return null;
    rest = rest.slice(1);
  }
  if (!rest.length) return value;
  const extra = parse0to19(rest);
  return extra === null ? null : value + extra;
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
 * Convertit un groupe de mots-nombres capturé par RUN_RE. S'il ne forme pas un nombre composé
 * valide (ex. « deux et trois », deux nombres isolés reliés par une conjonction), on retombe sur
 * une conversion mot à mot de part et d'autre de chaque « et », sans les fusionner.
 */
function convertRun(match) {
  const value = parseFullNumber(match.toLowerCase().split(/[ -]/));
  if (value !== null) return String(value);
  const parts = match.split(/(\s+et\s+)/i);
  if (parts.length === 1) return match;
  return parts.map((part) => {
    if (/^\s+et\s+$/i.test(part)) return part;
    const partValue = parseFullNumber(part.toLowerCase().split(/[ -]/));
    return partValue !== null ? String(partValue) : part;
  }).join('');
}

/**
 * Convertit les nombres écrits en toutes lettres d'un texte en chiffres. Les groupes composés
 * (espaces/tirets/« et ») sont traités avant l'article « un »/« une » isolé, pour que « vingt et
 * un jours » devienne 21 et non « vingt et 1 jours ». « un »/« une » restant, non absorbés par un
 * groupe, ne sont convertis que juste avant une unité connue (article sinon, jamais un nombre).
 * Une décimale dictée (« vingt-sept virgule cinq ») est recomposée après coup.
 */
function wordsToDigits(text) {
  let out = String(text ?? '');
  out = out.replace(RUN_RE, (match) => convertRun(match));
  out = out.replace(new RegExp(`\\b(un|une)\\b(?=\\s+${KNOWN_UNITS_RE.source})`, 'gi'), '1');
  out = out.replace(/(\d+)\s+virgule\s+(\d+)/gi, '$1.$2');
  return out;
}

/**
 * Valeur de chaque mot-nombre isolé du texte (mot au sens des espaces : un tiret interne reste
 * dans le même mot, donc « quatre-vingts » vaut 80, pas 4 puis 20). Filet de sécurité pour la
 * garde : n'essaie pas de composer plusieurs mots séparés par un espace entre eux. « un »/« une »
 * sont exclus (article ambigu, à gérer séparément par l'appelant).
 */
function wordValues(text) {
  const words = String(text ?? '').toLowerCase().match(/\p{L}+(?:-\p{L}+)*/gu) || [];
  const out = [];
  for (const w of words) {
    if (w === 'un' || w === 'une') continue;
    const value = parseFullNumber(w.split('-'));
    if (value !== null) out.push(value);
  }
  return out;
}

// ---- Ordinaux (garde uniquement) ----
// Un dialogue dit « le quatrième mois », la rédaction écrit « à 4 mois » : sans les ordinaux la
// garde voyait un nombre inventé et signalait la section. Lecture seule (valeurs pour l'ensemble
// autorisé) : `wordsToDigits` garde sa sémantique de réécriture et ignore toujours les ordinaux.
const ORDINAL_RE = /\b(\p{L}+)i[èe]mes?\b/giu;
const ORDINAL_IRREGULAR_RE = /\b(premi(?:er|ère|ere)|seconde?)\b/gi;
const ORDINAL_IRREGULAR = { premier: 1, première: 1, premiere: 1, second: 2, seconde: 2 };
const NUMBER_TOKEN = (t) => t === 'et' || t === 'cent' || t === 'cents' || t === 'mille' || UNITS[t] !== undefined || TENS[t] !== undefined;

/**
 * Cardinal d'un radical d'ordinal : « quatr » → quatre, « cinqu » → cinq, « neuv » → neuf,
 * « trent » → trente. Essais dans l'ordre : radical seul, radical + « e », « u » final retiré,
 * « v » final en « f ».
 */
function cardinalFromStem(stem) {
  for (const word of [stem, `${stem}e`, stem.replace(/u$/, ''), stem.replace(/v$/, 'f')]) {
    const value = parseFullNumber([word]);
    if (value !== null) return { word, value };
  }
  return null;
}

/**
 * Valeurs des ordinaux d'un texte (« quatrième » → 4, « premier » → 1). Un ordinal ne porte que la
 * fin d'un nombre composé : ce qui le précède immédiatement, s'il s'agit de mots-nombres collés par
 * un espace ou un tiret, est rattaché (« vingt et unième » → 21, « quatre-vingt-dixième » → 90).
 */
function ordinalValues(text) {
  const src = String(text ?? '');
  const out = [];
  for (const m of src.matchAll(ORDINAL_RE)) {
    const cardinal = cardinalFromStem(m[1].toLowerCase());
    if (!cardinal) continue;
    const before = src.slice(0, m.index).toLowerCase();
    const run = (before.match(/(?:\p{L}+[ -])+$/u) || [''])[0].split(/[ -]/).filter(Boolean);
    const tail = [];
    for (let i = run.length - 1; i >= 0 && NUMBER_TOKEN(run[i]); i -= 1) tail.unshift(run[i]);
    let value = cardinal.value;
    while (tail.length) {
      const composed = parseFullNumber([...tail, cardinal.word]);
      if (composed !== null) { value = composed; break; }
      tail.shift();
    }
    out.push(value);
  }
  for (const m of src.matchAll(ORDINAL_IRREGULAR_RE)) out.push(ORDINAL_IRREGULAR[m[1].toLowerCase()]);
  return out;
}

module.exports = { wordsToDigits, wordValues, ordinalValues };
