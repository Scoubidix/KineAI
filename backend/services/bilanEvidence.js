// Preuves déterministes d'un candidat d'extraction (spec 2026-09-26 §2) : le nom, la valeur et le
// côté proposés par le modèle doivent se lire dans la citation. Une preuve qui échoue n'écarte
// rien : elle envoie la ligne « à vérifier ». Pur : aucune I/O.

const REASONS = ['name_absent', 'value_absent', 'result_contradicted', 'result_uncertain', 'side_absent', 'side_contradicted', 'conflict', 'out_of_range', 'low_confidence'];
// Confiance déclarée par le modèle : non calibrée, simple signal secondaire (spec §2.4)
const LOW_CONFIDENCE = 0.6;

// Texte comparable : sans diacritiques, minuscules, espaces normalisés
function normalizeText(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// Texte des preuves : un saut de ligne sépare deux propositions (spec §2.2), il devient « ; »
// avant que normalizeText n'écrase les espaces. L'élision tombe (« d'épaule » n'est pas un côté
// droit), parenthèses et apostrophes deviennent des espaces. Les tirets restent : « - » est un
// résultat négatif.
function proofText(s) {
  return normalizeText(String(s ?? '').trim().replace(/\s*[\r\n]+\s*/g, ' ; ')).replace(/(?<![a-z0-9])(?:qu|[dljnmst])['’]/g, '').replace(/[()'’]/g, ' ').replace(/\s+/g, ' ').trim();
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Forme en mots entiers ; un espace de la forme accepte espace ou tiret dans la citation
const wordRe = (form) => new RegExp(`(?<![a-z0-9])${form.split(' ').map(escapeRe).join('[\\s-]+')}(?![a-z0-9])`);

const nameForm = (s) => proofText(String(s ?? '').replace(/_/g, ' ')).replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
const NAME_PREFIX = /^(?:test|testing|signe|manoeuvre) (?:de la |de |du |des )?/;
// Mots vides ignorés quand les mots du nom sont dispersés (« EVA 5 au repos »)
const STOPWORDS = new Set(['a', 'au', 'aux', 'de', 'des', 'du', 'en', 'et', 'la', 'le', 'les']);

/** Formes sous lesquelles un champ peut être nommé : clé, libellé, alias, et chacune sans « test de ». */
function nameForms(field) {
  const forms = new Set();
  const add = (s) => {
    const f = nameForm(s);
    if (f.length < 2) return;
    forms.add(f);
    const bare = f.replace(NAME_PREFIX, '');
    if (bare.length >= 2) forms.add(bare);
  };
  add(field.key);
  add(field.label);
  for (const a of Array.isArray(field.aliases) ? field.aliases : []) add(a);
  return [...forms];
}

// Propositions de la citation : séparées par « ; » ou par une virgule / un point suivis d'un
// espace (« 13,5 » et « 13.5 » restent entiers)
function clauses(text) {
  const out = [];
  const re = /;|[.,](?=\s|$)/g;
  let start = 0;
  let m;
  while ((m = re.exec(text)) !== null) { out.push({ start, end: m.index }); start = m.index + 1; }
  out.push({ start, end: text.length });
  return out;
}
const clauseAround = (text, pos) => clauses(text).find((c) => pos >= c.start && pos <= c.end) || { start: 0, end: text.length };

/** Première occurrence d'une forme du nom : d'un seul tenant, ou ses mots dans une même proposition. */
function findName(text, forms) {
  let best = null;
  const keep = (r) => { if (!best || r.start < best.start) best = r; };
  for (const f of forms) {
    const m = wordRe(f).exec(text);
    if (m) { keep({ start: m.index, end: m.index + m[0].length }); continue; }
    const tokens = f.split(' ').filter((t) => !STOPWORDS.has(t));
    if (tokens.length < 2) continue;
    for (const c of clauses(text)) {
      const part = text.slice(c.start, c.end);
      const hits = tokens.map((t) => wordRe(t).exec(part));
      if (hits.every(Boolean)) {
        keep({ start: c.start + Math.min(...hits.map((h) => h.index)), end: c.start + Math.max(...hits.map((h) => h.index + h[0].length)) });
        break;
      }
    }
  }
  return best;
}

// Positions de la valeur chiffrée : ses chiffres, ou à défaut (dictée sans chiffre) un mot-nombre
const NUMBER_WORD_RE = /(?<![a-z0-9])(?:zero|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize|vingt|trente|quarante|cinquante|soixante|cent|cents|mille)(?![a-z0-9])/;
function numberPositions(text, value) {
  const t = text.replace(/,/g, '.');
  const abs = Math.abs(value);
  for (const f of new Set([String(abs), abs.toFixed(1), String(Math.trunc(abs))])) {
    const found = [...t.matchAll(new RegExp(`(?<![\\d.])${escapeRe(f)}(?![\\d])`, 'g'))].map((m) => m.index);
    if (found.length) return found;
  }
  if (/\d/.test(t)) return [];
  const w = NUMBER_WORD_RE.exec(t);
  return w ? [w.index] : [];
}

const SIDE_RE = /(?<![a-z0-9])(?:(des deux cotes|deux cotes|ddc|bilateral|bilaterale|bilaterales|bilateraux|d et g|g et d|d\/g|g\/d)|(droite|droites|droit|droits|dte|dt|d)|(gauche|gauches|gche|g))(?![a-z0-9])/g;
function sideMarkers(text) {
  const out = [];
  const re = new RegExp(SIDE_RE.source, 'g');
  let m;
  while ((m = re.exec(text)) !== null) out.push({ index: m.index, side: m[1] ? 'DG' : m[2] ? 'D' : 'G' });
  return out;
}
// Portée du nom : de lui à la fin de sa proposition, prolongée des propositions qui commencent
// par un côté (« Flexion D 140°, G 140° ») ; elle s'arrête au nom suivant (« …, abduction D 90° »)
const SIDE_START_RE = new RegExp(`^(?:a )?${SIDE_RE.source}`);
function nameScopeEnd(text, name) {
  const cs = clauses(text);
  let i = cs.findIndex((c) => name.start >= c.start && name.start <= c.end);
  while (i + 1 < cs.length && SIDE_START_RE.test(text.slice(cs[i + 1].start, cs[i + 1].end).trim())) i += 1;
  return cs[i].end;
}

/**
 * Occurrences de la valeur rattachées au nom : celles de sa portée ; à défaut la première après
 * le nom, puis la première de la citation (valeur écrite avant le nom).
 */
function numberAnchors(text, value, name) {
  const all = numberPositions(text, value);
  if (!name) return all.slice(0, 1);
  const after = all.filter((p) => p >= name.start);
  const end = nameScopeEnd(text, name);
  const scoped = after.filter((p) => p < end);
  if (scoped.length) return scoped;
  return (after.length ? after : all).slice(0, 1);
}

// Côté écrit pour la valeur : le marqueur le plus proche avant elle dans sa proposition, sinon le
// premier après elle dans la même proposition
function sideAt(text, anchor) {
  const { start, end } = clauseAround(text, anchor);
  const marks = sideMarkers(text).filter((m) => m.index >= start && m.index < end);
  const before = marks.filter((m) => m.index < anchor);
  if (before.length) return before[before.length - 1].side;
  const after = marks.find((m) => m.index >= anchor);
  return after ? after.side : null;
}

// Résultat d'un test : négatif si un marqueur négatif est dans la proposition du nom, positif
// sinon — y compris sans marqueur (décision du 26 sept. : nommer un signe vaut présence)
const NEG_RE = /(?<![a-z0-9])(?:negatif|negative|negatifs|negatives|neg|absent|absente|absents|absentes|absence|aucun|aucune|non|pas|sans)(?![a-z0-9])|(?:^|[\s:=/])[-−](?=$|[\s),;.:/])|(?<=[a-z0-9])[-−](?=$|[\s),;.:/])/;
const POS_RE = /(?<![a-z0-9])(?:positif|positive|positifs|positives|pos|present|presente|presents|presentes)(?![a-z0-9])|\+/;
const DOUBT_RE = /\?|(?<![a-z0-9])(?:douteux|douteuse|equivoque)(?![a-z0-9])/;
// Puce en tête de proposition (« - Hawkins D ») : de la mise en forme, pas une négation
const BULLET_RE = /^\s*[-−]\s*(?=[a-z])/;
function booleanReason(text, at, proposed) {
  const { start, end } = clauseAround(text, at);
  const clause = text.slice(start, end).replace(BULLET_RE, '');
  if (DOUBT_RE.test(clause)) return 'result_uncertain';
  const neg = NEG_RE.test(clause);
  if (neg && POS_RE.test(clause)) return 'result_uncertain';
  return proposed === !neg ? null : 'result_contradicted';
}

// Option d'un champ à choix : telle quelle, ou (options en mots « Propre / fermée ») un de ses mots
function enumProven(text, option) {
  const o = proofText(option);
  if (!o) return false;
  if (wordRe(o).test(text)) return true;
  if (/\d/.test(o)) return false;
  return o.split(/\s*\/\s*/).filter((p) => p.length >= 3).some((p) => wordRe(p).test(text));
}

/**
 * Raisons pour lesquelles un candidat ne peut pas être rempli d'office. Liste vide = prouvé.
 * @param {{ quote: string, forms: string[], fieldType: 'NUMERIC'|'BOOLEAN'|'ENUM'|'TEXT', value: any, side: 'D'|'G'|null, lateralized: boolean, confidence: number }} c
 * @returns {string[]} sous-ensemble ordonné de REASONS
 */
function evidenceReasons({ quote, forms, fieldType, value, side, lateralized, confidence }) {
  const text = proofText(quote);
  const reasons = [];
  const name = findName(text, forms);
  if (!name) reasons.push('name_absent');
  // Un chiffré peut porter sa valeur des deux côtés (« D 140°, G 140° ») : une occurrence écrite
  // du côté proposé suffit
  let sideAnchors = [name ? name.end : 0];
  if (fieldType === 'NUMERIC') {
    const at = typeof value === 'number' ? numberAnchors(text, value, name) : [];
    if (!at.length) reasons.push('value_absent');
    else sideAnchors = at;
  } else if (fieldType === 'BOOLEAN') {
    const r = booleanReason(text, name ? name.start : 0, value === true);
    if (r) reasons.push(r);
  } else if (fieldType === 'ENUM') {
    if (!enumProven(text, String(value ?? ''))) reasons.push('value_absent');
  } else if (fieldType === 'TEXT') {
    const v = proofText(value);
    if (!v || !text.includes(v)) reasons.push('value_absent');
  }
  if (lateralized) {
    const found = sideAnchors.map((a) => sideAt(text, a)).filter((f) => f !== null);
    if (!found.length || side === null) reasons.push('side_absent');
    else if (!found.some((f) => f === 'DG' || f === side)) reasons.push('side_contradicted');
  }
  if (typeof confidence === 'number' && confidence < LOW_CONFIDENCE) reasons.push('low_confidence');
  return reasons;
}

// Auto-correction dite à voix haute (« euh non pardon je m'embrouille ») : ce qui la précède a
// peut-être été démenti. Formes du texte de preuve (sans accent, élision tombée : « je m'embrouille »
// → « je embrouille »). « non », « pardon », « plutôt », « correction » seuls sont trop fréquents.
const SELF_CORRECTION_RE = /(?<![a-z0-9])(?:non pardon|euh non|pardon non|je me suis trompee?|je me trompe|je m? ?embrouille|c est l? ?inverse|je rectifie|rectification)(?![a-z0-9])/;
const SELF_CORRECTION_SPAN = 300;

/**
 * Une marque d'auto-correction suit-elle la citation dans les notes (300 caractères) ? Toute
 * occurrence de la citation compte : doute en plus, jamais de preuve en plus.
 * @param {string} notesProof notes passées par proofText
 */
function selfCorrectedAfter(notesProof, quote) {
  const q = proofText(quote);
  if (!q) return false;
  for (let i = notesProof.indexOf(q); i !== -1; i = notesProof.indexOf(q, i + 1)) {
    const end = i + q.length;
    if (SELF_CORRECTION_RE.test(notesProof.slice(end, end + SELF_CORRECTION_SPAN))) return true;
  }
  return false;
}

module.exports = { REASONS, LOW_CONFIDENCE, normalizeText, proofText, nameForms, findName, evidenceReasons, selfCorrectedAfter };
