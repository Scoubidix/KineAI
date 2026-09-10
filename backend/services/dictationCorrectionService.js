// Passe de correction de la dictée : le modèle propose des opérations (remplacer un terme, supprimer
// une hésitation ou un fragment auto-corrigé), le serveur les applique sous gardes déterministes.
// Le texte ne peut être ni réécrit ni allongé par construction ; tout doute → texte brut.
const { z } = require('zod');
const logger = require('../utils/logger');
const llmService = require('./llmService');
const { numbersIn } = require('./bilanComposeService');
const { parseJsonOutput } = require('./bilanExtractionService');
const { EXTRA_TERMS } = require('../data/dictationExtraTerms');

const MODES = ['dictation', 'session'];
const FILLERS = ['euh', 'hum', 'bah', 'ben', 'hein', 'voilà', 'donc voilà'];
// Mots-nombres français : jamais supprimés ni remplacés (même liste que le bench du worker)
const NUMBER_WORDS = new Set(['zéro', 'un', 'une', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix',
  'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'vingt', 'vingts', 'trente', 'quarante', 'cinquante', 'soixante',
  'cent', 'cents', 'mille']);
const WORDS_PER_OP = 15;
const MIN_OPS_ALLOWED = 3;
const MAX_DELETED_RATIO = 0.2;
const MAX_TO_WORDS = 4;
const MAX_OPS = 60;
const PUNCT = /[.,;:!?()«»"]/g;
// Ponctuation tolérée collée à la fin d'un mot (fermante uniquement)
const PUNCT_TAIL = '[.,;:!?)»"]*';
const LETTERS = 'A-Za-zÀ-ÖØ-öø-ÿŒœ';

const normSpaces = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const tokens = (s) => normSpaces(s).replace(PUNCT, ' ').split(' ').filter(Boolean);
const hasDigit = (s) => /\d/.test(s);
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Pliage caractère par caractère (accents retirés, minuscules) qui conserve la longueur :
// on cherche dans le texte plié, on découpe le texte d'origine aux mêmes index.
function fold(s) {
  return Array.from(s, (c) => { const f = c.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); return f.length === 1 ? f : c; }).join('');
}
const hasNumberWord = (s) => tokens(fold(s)).some((w) => w.split('-').some((p) => NUMBER_WORDS.has(p) || NUMBER_WORDS.has(p.normalize('NFD').replace(/[\u0300-\u036f]/g, ''))));

// Motif d'un groupe de mots de contexte (before/after) : chaque mot entier, ponctuation collée tolérée, espaces souples
const group = (s) => tokens(fold(s)).map((w) => `${escapeRe(w)}${PUNCT_TAIL}`).join('\\s+');

/**
 * Localise « before from after » en mots entiers (recherche insensible casse/accents).
 * Le groupe 1 capturé est composé des seuls mots de `from` (ponctuation interne tolérée entre les
 * mots, jamais après le dernier) ; le groupe 2 capture la ponctuation collée juste après ce dernier
 * mot, hors capture, pour que `replace` ne touche jamais cette ponctuation alors que `delete` peut
 * l'emporter avec les mots.
 * @returns {[number, number, number]|null} [début des mots, fin des mots, fin de la ponctuation collée]
 */
function locate(text, before, from, after) {
  const folded = fold(text);
  const fromWords = tokens(fold(from));
  const fCore = fromWords.map((w, i) => (i < fromWords.length - 1 ? `${escapeRe(w)}${PUNCT_TAIL}` : escapeRe(w))).join('\\s+');
  const b = group(before); const a = group(after);
  const pattern = `(?<![${LETTERS}])${b ? `${b}\\s+` : ''}(${fCore})(${PUNCT_TAIL})${a ? `\\s+${a}` : ''}(?![${LETTERS}])`;
  const matches = [...folded.matchAll(new RegExp(pattern, 'gd'))];
  if (matches.length !== 1) return null;
  const [wordsStart, wordsEnd] = matches[0].indices[1];
  const [, tailEnd] = matches[0].indices[2];
  return [wordsStart, wordsEnd, tailEnd];
}

const cleanup = (s) => s.replace(/\s+/g, ' ').replace(/\s+([,.;:!?])/g, '$1').trim();

/** Vrai si tout nombre en chiffres du texte corrigé existe dans le texte brut. */
function numbersGuard(raw, corrected) {
  const allowed = new Set(numbersIn(raw));
  return numbersIn(corrected).every((n) => allowed.has(n));
}

/**
 * Applique les opérations sous gardes. Pur.
 * @returns {{ text: string, applied: number, ignored: number }}
 */
function applyOps(text, ops, mode) {
  const raw = String(text ?? '');
  const wordCount = tokens(raw).length;
  const giveUp = (why) => { logger.warn(`Correction dictée abandonnée : ${why} (${ops.length} opération(s), ${wordCount} mots)`); return { text: raw, applied: 0, ignored: ops.length }; };
  if (ops.length > Math.max(MIN_OPS_ALLOWED, Math.floor(wordCount / WORDS_PER_OP))) return giveUp('plafond d’opérations');

  let current = raw;
  let applied = 0; let ignored = 0; let deletedWords = 0;
  for (const op of ops) {
    const from = normSpaces(op.from); const to = normSpaces(op.to);
    const before = normSpaces(op.before); const after = normSpaces(op.after);
    const fromTokens = tokens(from);
    let ok = fromTokens.length > 0 && !hasDigit(from) && !hasNumberWord(from);
    if (ok && op.op === 'replace') ok = to.length > 0 && !hasDigit(to) && tokens(to).length <= MAX_TO_WORDS;
    if (ok && op.op === 'delete') ok = FILLERS.includes(fold(from).replace(PUNCT, '').trim()) || (mode === 'dictation' && fromTokens.length >= 2);
    const pos = ok ? locate(current, before, from, after) : null;
    if (!pos) { ignored += 1; continue; }
    const [start, wordsEnd, tailEnd] = pos;
    // replace ne touche que les mots (group 1) ; delete emporte aussi la ponctuation collée qui suivait
    const end = op.op === 'delete' ? tailEnd : wordsEnd;
    current = cleanup(current.slice(0, start) + (op.op === 'replace' ? to : '') + current.slice(end));
    if (op.op === 'delete') deletedWords += fromTokens.length;
    applied += 1;
  }
  // Un seul « from » sans plafond de longueur peut à lui seul dépasser le ratio : la garde s'applique dès une suppression.
  if (wordCount > 0 && deletedWords / wordCount > MAX_DELETED_RATIO) return giveUp('trop de suppressions');
  if (!numbersGuard(raw, current)) return giveUp('nombre nouveau');
  return { text: current, applied, ignored };
}

module.exports = { MODES, FILLERS, NUMBER_WORDS, MAX_OPS, applyOps, numbersGuard, fold };
