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
// requireMarker : nom ou côté pris dans la phrase (levier 2) → le positif par défaut ne vaut plus,
// un marqueur explicite est exigé
function booleanReason(text, at, proposed, requireMarker = false) {
  const { start, end } = clauseAround(text, at);
  const clause = text.slice(start, end).replace(BULLET_RE, '');
  if (DOUBT_RE.test(clause)) return 'result_uncertain';
  const neg = NEG_RE.test(clause);
  const pos = POS_RE.test(clause);
  if (neg && pos) return 'result_uncertain';
  if (requireMarker && !neg && !pos) return 'result_uncertain';
  return proposed === !neg ? null : 'result_contradicted';
}

// --- Levier 2 (arbitrage du 27 sept.) : nom et côté lus dans la phrase de la citation ---

// Phrase de la citation dans les notes : bornée par « . » suivi d'un espace, « ; » (le saut de
// ligne en est devenu un), « ! », « ? » — pas la virgule — et à 100 caractères de part et d'autre
// (les transcriptions n'ont pas de ponctuation)
const WINDOW_SPAN = 100;
const SENTENCE_END_RE = /\.(?=\s|$)|[;!?]/g;
const isWordChar = (c) => /[a-z0-9]/.test(c || '');

/**
 * Fenêtre de la citation dans les notes, en texte de preuve. null si la citation est introuvable
 * ou présente plusieurs fois (quelle phrase lire ? on ne devine pas).
 * @param {string} notesProof notes passées par proofText
 * @returns {{ text: string, start: number } | null} start = position de la citation dans text
 */
function quoteContext(notesProof, quote) {
  const q = proofText(quote);
  if (!q) return null;
  const at = notesProof.indexOf(q);
  if (at === -1 || notesProof.indexOf(q, at + 1) !== -1) return null;
  const qEnd = at + q.length;
  let start = Math.max(0, at - WINDOW_SPAN);
  let end = Math.min(notesProof.length, qEnd + WINDOW_SPAN);
  for (const m of notesProof.matchAll(SENTENCE_END_RE)) {
    if (m.index < at) start = Math.max(start, m.index + 1);
    else if (m.index >= qEnd) { end = Math.min(end, m.index); break; }
  }
  // Borne tombée au milieu d'un mot : le fragment est retiré
  while (start < at && isWordChar(notesProof[start - 1]) && isWordChar(notesProof[start])) start += 1;
  while (end > qEnd && isWordChar(notesProof[end]) && isWordChar(notesProof[end - 1])) end -= 1;
  const lead = notesProof.slice(start, at).match(/^\s*/)[0].length;
  return { text: notesProof.slice(start + lead, end).trimEnd(), start: at - start - lead };
}

// Valeur écrite : chiffres ou mot-nombre (« un / une », surtout des déterminants, n'en sont pas)
const VALUE_WORD_RE = new RegExp(NUMBER_WORD_RE.source.replace('un|une|', ''));
const hasValue = (s) => /\d/.test(s) || VALUE_WORD_RE.test(s);
const lastEnd = (s, token) => {
  let end = -1;
  const re = new RegExp(wordRe(token).source, 'g');
  let m;
  while ((m = re.exec(s)) !== null) end = m.index + m[0].length;
  return end;
};

/**
 * Nom complété par la phrase : un mot d'une forme dans la proposition d'ancrage (bornée à la
 * citation), tous les autres écrits AVANT elle dans la fenêtre, jamais après. Garde : aucune
 * autre valeur entre ces mots et l'ancrage (« Genou D : flexion 95°, hanche : flexion 100° » ne
 * complète pas la flexion de genou pour 100°), sauf liste qui reprend le nom par sa valeur
 * (« EVA 4 repos, 7 effort » : l'ancrage commence par la valeur, les mots sont dans la
 * proposition juste avant).
 */
function nameByWindow(win, off, text, forms, clause) {
  const anchor = text.slice(clause.start, clause.end);
  const before = win.slice(0, off + clause.start);
  const continuation = new RegExp(`^\\s*(?:\\d|${VALUE_WORD_RE.source})`).test(anchor);
  for (const f of forms) {
    const tokens = f.split(' ').filter((t) => !STOPWORDS.has(t));
    if (tokens.length < 2) continue;
    const rest = tokens.filter((t) => !wordRe(t).test(anchor));
    if (!rest.length || rest.length === tokens.length) continue;
    const ends = rest.map((t) => lastEnd(before, t));
    if (ends.some((e) => e < 0)) continue;
    const gap = before.slice(Math.min(...ends));
    if (!hasValue(gap)) return true;
    if (continuation && !clauses(gap.replace(/[;,.]\s*$/, '')).slice(1).length) return true;
  }
  return false;
}

// Côté pris dans la phrase quand la citation n'en porte aucun : marqueur qui suit immédiatement
// la citation (espaces, « à »), ou en-tête « X D : » avant elle sans autre valeur entre les deux.
// Les deux présents et différents → aucun.
const SIDE_AFTER_RE = new RegExp(`^\\s*(?:a\\s+)?${SIDE_RE.source}`);
const sideOf = (m) => (m[1] ? 'DG' : m[2] ? 'D' : 'G');
function windowSide(win, off, len) {
  const after = SIDE_AFTER_RE.exec(win.slice(off + len));
  const before = win.slice(0, off);
  let heading = null;
  const re = new RegExp(SIDE_RE.source, 'g');
  let m;
  while ((m = re.exec(before)) !== null) {
    const rest = before.slice(m.index + m[0].length);
    if (/^\s*:/.test(rest) && !hasValue(rest)) heading = sideOf(m);
  }
  const found = [after && sideOf(after), heading].filter(Boolean);
  return found.length && found.every((s) => s === found[0]) ? found[0] : null;
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
 * `context` (quoteContext) : la phrase des notes autour de la citation. Le nom peut s'y compléter
 * et le côté s'y lire ; la valeur et le résultat se lisent toujours dans la citation.
 * @param {{ quote: string, forms: string[], fieldType: 'NUMERIC'|'BOOLEAN'|'ENUM'|'TEXT', value: any, side: 'D'|'G'|null, lateralized: boolean, confidence: number, context?: { text: string, start: number } | null }} c
 * @returns {string[]} sous-ensemble ordonné de REASONS
 */
function evidenceReasons({ quote, forms, fieldType, value, side, lateralized, confidence, context }) {
  const text = proofText(quote);
  const reasons = [];
  const name = findName(text, forms);
  // Sans contexte, la « phrase » est la citation elle-même (citation sur deux propositions)
  const win = context ? context.text : text;
  const off = context ? context.start : 0;
  const values = fieldType === 'NUMERIC' && typeof value === 'number' ? numberPositions(text, value) : [];
  // Proposition d'ancrage d'un nom complété : celle de la valeur pour un chiffré, sinon la
  // première proposition de la citation qui porte un mot du nom
  let anchor = null;
  if (!name) {
    const candidates = fieldType === 'NUMERIC' ? values.map((p) => ({ ...clauseAround(text, p), at: p })) : clauses(text);
    anchor = candidates.find((c) => nameByWindow(win, off, text, forms, c)) || null;
  }
  if (!name && !anchor) reasons.push('name_absent');
  // Citation sans aucun côté écrit : la phrase peut le porter (levier 2)
  const sideFromWindow = lateralized && !!context && !sideMarkers(text).length;
  // Un chiffré peut porter sa valeur des deux côtés (« D 140°, G 140° ») : une occurrence écrite
  // du côté proposé suffit
  let sideAnchors = [name ? name.end : 0];
  if (fieldType === 'NUMERIC') {
    const at = anchor ? [anchor.at] : typeof value === 'number' ? numberAnchors(text, value, name) : [];
    if (!at.length) reasons.push('value_absent');
    else sideAnchors = at;
  } else if (fieldType === 'BOOLEAN') {
    // Nom complété ou côté lu hors de la citation : elle est incomplète, le positif par défaut
    // ne vaut plus (« Hawkins » cité dans « Hawkins D - »)
    const r = anchor ? booleanReason(text, anchor.start, value === true, true) : booleanReason(text, name ? name.start : 0, value === true, sideFromWindow);
    if (r) reasons.push(r);
  } else if (fieldType === 'ENUM') {
    if (!enumProven(text, String(value ?? ''))) reasons.push('value_absent');
  } else if (fieldType === 'TEXT') {
    const v = proofText(value);
    if (!v || !text.includes(v)) reasons.push('value_absent');
  }
  if (lateralized) {
    const found = sideFromWindow
      ? [windowSide(win, off, text.length)].filter(Boolean)
      : sideAnchors.map((a) => sideAt(text, a)).filter((f) => f !== null);
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

module.exports = { REASONS, LOW_CONFIDENCE, normalizeText, proofText, nameForms, findName, evidenceReasons, selfCorrectedAfter, quoteContext };
