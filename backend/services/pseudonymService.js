// Pseudonymisation déterministe des textes envoyés au modèle (spec 2026-09-12) : dictionnaire
// d'identité connue, motifs (Safe Harbor transposé), règles de contexte ; jetons typés cohérents ;
// réhydratation côté serveur. Pur : aucune I/O, aucun log, aucune date implicite.
const { wordsToDigits } = require('../utils/frenchNumbers');

const TOKEN_TYPES = ['Prénom', 'NOM', 'Kiné', 'Patient', 'Tiers', 'Date de naissance', 'Téléphone', 'E-mail', 'NIR', 'Adresse', 'URL', 'Numéro'];
const CIVILITIES = ['m', 'mr', 'monsieur', 'mme', 'madame', 'mlle', 'mademoiselle', 'dr', 'docteur', 'pr', 'professeur'];
const ROLES = ['docteur', 'medecin', 'chirurgien', 'chirurgienne', 'infirmier', 'infirmiere', 'kine', 'osteo', 'osteopathe', 'generaliste', 'rhumato', 'rhumatologue', 'orthopediste'];
const LINKS = ['fils', 'fille', 'mari', 'femme', 'compagnon', 'compagne', 'pere', 'mere', 'frere', 'soeur', 'collegue', 'voisin', 'voisine', 'patron', 'patronne'];
const PRESENTATIONS = ['je m appelle', 'je suis', 'vous etes', 'patient', 'patiente', 'le patient', 'la patiente'];
// Noms/prénoms qui sont aussi des mots courants : remplacés seulement avec majuscule ou civilité, jamais approchés
const COMMON_WORD_NAMES = new Set(['petit', 'blanc', 'noir', 'roux', 'brun', 'marchand', 'boulanger', 'martin', 'pierre', 'rose', 'victoire', 'claire', 'marine', 'france', 'marie', 'jean', 'paul', 'louis', 'fort', 'grand', 'lebon', 'bon', 'roi', 'leroi', 'legrand', 'lepetit', 'blanche', 'olive', 'cerise', 'prune']);
const MONTHS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
// Éponymes cliniques capitalisés qui suivent parfois un marqueur (« méthode McKenzie ») : jamais des tiers
const CLINICAL_EPONYMS = new Set(['lachman', 'mckenzie', 'lasegue', 'schober', 'sorensen', 'spurling', 'phalen', 'tinel', 'kleiger', 'thompson', 'jobe', 'neer', 'hawkins', 'kennedy', 'ottawa', 'jamar', 'trendelenburg', 'thomas', 'ober', 'faber', 'patrick', 'apley', 'mcmurray', 'yocum', 'gerber', 'speed', 'yergason', 'adson', 'roos', 'romberg', 'fukuda', 'dix', 'hallpike', 'timed', 'tinetti', 'berg', 'borg']);

const foldChar = (c) => { const f = c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); return f.length === 1 ? f : c; };
/** Repli caractère par caractère qui conserve la longueur : on cherche dans le texte plié, on découpe l'original. */
const fold = (s) => Array.from(String(s ?? ''), (c) => ("'’-".includes(c) ? ' ' : foldChar(c))).join('');
const isCapitalized = (word) => /^\p{Lu}[\p{Ll}\p{M}'’-]*$/u.test(word) || /^\p{Lu}[\p{Ll}\p{M}]+[-'’]\p{Lu}[\p{Ll}\p{M}]+$/u.test(word);

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Frontière de mot : tout sauf lettre ou marque diacritique (le « . » et le « @ » d'un e-mail en sont)
const LETTER = '\\p{L}\\p{M}';
const B_BEFORE = `(?<![${LETTER}])`;
const B_AFTER = `(?![${LETTER}])`;
const WORD = `[${LETTER}]+`;
/** Alternance de marqueurs pliés ; un marqueur en plusieurs mots tolère les espaces multiples. */
const alt = (words) => words.map((w) => escapeRe(w).split(' ').join('\\s+')).join('|');
/** Motif d'une forme pliée, cherchée en mots entiers (espaces souples). */
const formPattern = (form) => form.split(/\s+/).map(escapeRe).join('\\s+');

function damerauLevenshtein(a, b) { /* distance d'édition avec transposition, O(n·m) */
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const d = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : (j === 0 ? i : 0))));
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[m][n];
}

/** Tolérance orthographique admise pour une forme de cette longueur : 1 lettre dès 5, 2 dès 8, jamais sous 5. */
const approxThreshold = (length) => (length >= 8 ? 2 : (length >= 5 ? 1 : 0));

function computeAge(birthDate, at = new Date()) { /* âge révolu ; null si birthDate absente ou invalide */
  if (birthDate === null || birthDate === undefined || birthDate === '') return null;
  const born = birthDate instanceof Date ? birthDate : new Date(birthDate);
  const ref = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(born.getTime()) || Number.isNaN(ref.getTime())) return null;
  let age = ref.getUTCFullYear() - born.getUTCFullYear();
  const months = ref.getUTCMonth() - born.getUTCMonth();
  if (months < 0 || (months === 0 && ref.getUTCDate() < born.getUTCDate())) age -= 1;
  return age;
}

const pad2 = (n) => String(n).padStart(2, '0');
/** Formes textuelles d'une date : 03/03/1980, 3/3/1980, 03-03-1980, 03.03.1980, 3 mars 1980, 03 mars 1980 (repliées). */
function dateForms(d) {
  if (!d) return [];
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return [];
  const day = date.getUTCDate();
  const month = date.getUTCMonth();
  const year = date.getUTCFullYear();
  const forms = [];
  for (const sep of ['/', '-', '.']) {
    forms.push(`${pad2(day)}${sep}${pad2(month + 1)}${sep}${year}`);
    forms.push(`${day}${sep}${month + 1}${sep}${year}`);
  }
  forms.push(`${day} ${MONTHS[month]} ${year}`);
  forms.push(`${pad2(day)} ${MONTHS[month]} ${year}`);
  return [...new Set(forms.map(fold))];
}

// ---- Motifs (Safe Harbor transposé) ----
// Les motifs à chiffres et l'e-mail/URL tournent sur le texte d'origine (un tiret y est significatif,
// alors que le repli le transforme en espace) ; l'adresse et le numéro de dossier tournent sur le
// texte plié (accents et casse). Le repli conservant la longueur, les index sont les mêmes.
const PHONE_RE = /(?<!\d)(?:\+33\s?[1-9]|0[1-9])(?:[\s.-]?\d{2}){4}(?!\d)/g;
const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const NIR_RE = /(?<!\d)[12]\s?\d{2}\s?\d{2}\s?\d{2}\s?\d{3}\s?\d{3}(?:\s?\d{2})?(?!\d)/g;
const URL_RE = /(?:https?:\/\/|www\.)\S+/gi;
const POSTAL_CITY_RE = /(?<!\d)\d{5}\s+\p{Lu}[\p{L}-]+/gu;
const FOLDER_RE = /(?<=(?:\bdossier|n°)\s?)\d{3,}(?!\d)/g;
const STREET_TYPES = ['rue', 'avenue', 'av.', 'boulevard', 'bd', 'chemin', 'allee', 'impasse', 'place', 'route', 'quai', 'square'];
const STREET_RE = new RegExp(`(?<![${LETTER}\\d.])\\d{1,4}(?:\\s?(?:bis|ter))?\\s+(?:${alt(STREET_TYPES)})${B_AFTER}`, 'gu');
// « 12 rue des Lilas à Lyon » : la ville est conservée (spec §4.4), l'adresse s'arrête donc au locatif
const ADDRESS_STOP = new Set(['a', 'au', 'aux', 'chez']);
const TRAILING_PUNCT = '.,;:!?)»';

// Segment de date « jour mois année », chaque nombre en chiffres ou en toutes lettres
const NUMBER_WORD = '(?:zero|une?|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize|vingts?|trente|quarante|cinquante|soixante|cents?|mille|et)';
const NUMBER_RUN = `(?:\\d{1,4}|${NUMBER_WORD}(?:\\s+${NUMBER_WORD})*)`;
const BIRTH_DATE_RE = new RegExp(`${B_BEFORE}(?:nee?s?|naissance)${B_AFTER}(?:\\s+\\S+){0,4}?\\s+(${NUMBER_RUN}\\s+(?:${alt(MONTHS)})\\s+${NUMBER_RUN})${B_AFTER}`, 'gdu');
// Le segment n'est une date que si `wordsToDigits` en tire un jour, un mois et une année à 4 chiffres
const DIGITS_DATE_RE = new RegExp(`^\\d{1,2}\\s+(?:${alt(MONTHS)})\\s+\\d{4}$`, 'u');

/** Segments « jour mois année » situés à quatre mots au plus derrière « né(e) » ou « naissance ». */
const birthDateSegments = (folded) => [...folded.matchAll(BIRTH_DATE_RE)].map((m) => m.indices[1]).filter(Boolean);

// Règles de contexte : marqueur lexical puis un ou deux mots capitalisés
const CIVILITY_RE = new RegExp(`${B_BEFORE}(?:${alt(CIVILITIES)})\\.?\\s+(${WORD})(?:\\s+(${WORD}))?${B_AFTER}`, 'gdu');
const ROLE_RE = new RegExp(`${B_BEFORE}(?:${alt(ROLES)})\\s+(${WORD})${B_AFTER}`, 'gdu');
const LINK_RE = new RegExp(`${B_BEFORE}(?:mon|ma)\\s+(?:${alt(LINKS)})\\s+(${WORD})${B_AFTER}`, 'gdu');
const PRESENTATION_RE = new RegExp(`${B_BEFORE}(?:${alt(PRESENTATIONS)})\\s+(${WORD})(?:\\s+(${WORD}))?${B_AFTER}`, 'gdu');

// Un jeton déjà posé n'est jamais remasqué : les crochets servent de garde (spec §5)
const TOKEN_RE = /\[[^[\]\n]{1,40}\]/g;
const tokenSpans = (text) => [...text.matchAll(TOKEN_RE)].map((m) => ({ start: m.index, end: m.index + m[0].length }));
/** Types portés par un jeton, y compris composite (« [Prénom] [NOM] ») ; le numéro des tiers est retiré. */
const tokenTypes = (token) => (token.match(/\[[^[\]]+\]/g) || []).map((t) => t.slice(1, -1).replace(/ \d+$/, ''));

/** Toutes les occurrences d'une forme pliée, en mots entiers. */
function findForm(folded, form) {
  const out = [];
  const re = new RegExp(`${B_BEFORE}${formPattern(form)}${B_AFTER}`, 'gu');
  let m = re.exec(folded);
  while (m !== null) {
    out.push([m.index, m.index + m[0].length]);
    m = re.exec(folded);
  }
  return out;
}

const PREVIOUS_WORD_RE = new RegExp(`(?:^|[^${LETTER}])([${LETTER}]+)\\.?\\s{0,2}$`, 'u');
/** Vrai si le mot qui précède immédiatement (à deux blancs près, point d'abréviation admis) est une civilité. */
function precededByCivility(folded, start) {
  const before = folded.slice(0, start).match(PREVIOUS_WORD_RE);
  return Boolean(before) && CIVILITIES.includes(before[1]);
}

class Pseudonymizer {
  constructor({ patient, kine, at }) {
    this.at = at || new Date();
    this.patient = patient && (patient.firstName || patient.lastName) ? patient : null;
    this.kine = kine || null;
    this.freeMode = !this.patient;
    this.table = new Map();      // jeton → valeur d'origine (première occurrence)
    this.byValue = new Map();    // valeur pliée → jeton
    this.tiers = 0;
    this.counts = {};
    this.patientAssigned = false;
    this.knownForms = this._buildKnownForms();   // [{ form (pliée), token, approx: boolean, common: boolean, words: n }]
    this.formsByString = new Map(this.knownForms.map((f) => [f.form, f.token]));
    this.birthForms = this.patient ? dateForms(this.patient.birthDate) : [];
  }

  _buildKnownForms() {
    const forms = new Map();
    const push = (raw, token, approx = true) => {
      const form = fold(raw).trim().replace(/\s+/g, ' ');
      const words = form ? form.split(' ') : [];
      const letters = form.replace(new RegExp(`[^${LETTER}]`, 'gu'), '').length;
      if (!form || letters < 3 || forms.has(form)) return;
      const common = words.every((w) => COMMON_WORD_NAMES.has(w));
      // Un mot courant n'est jamais approché (spec §4.1) ; l'e-mail du kiné non plus (approx = false)
      forms.set(form, { form, token, words: words.length, letters, common, approx: approx && !common && words.length === 1 && letters >= 5 });
    };
    // Un nom composé donne ses parties : « Lefèvre-Da Silva » → « Lefèvre », « Da Silva », « Silva »
    const parts = (raw) => {
      const out = [String(raw)];
      for (const chunk of String(raw).split('-')) {
        out.push(chunk);
        for (const word of chunk.split(/\s+/)) out.push(word);
      }
      return out;
    };
    const addPerson = (person, firstToken, lastToken, fullToken, reverseToken) => {
      if (!person) return;
      const first = person.firstName ? String(person.firstName).trim() : '';
      const last = person.lastName ? String(person.lastName).trim() : '';
      if (first && last) {
        push(`${first} ${last}`, fullToken);
        push(`${last} ${first}`, reverseToken);
      }
      if (last) for (const p of parts(last)) push(p, lastToken);
      if (first) for (const p of parts(first)) push(p, firstToken);
    };
    addPerson(this.patient, '[Prénom]', '[NOM]', '[Prénom] [NOM]', '[NOM] [Prénom]');
    addPerson(this.kine, '[Kiné]', '[Kiné]', '[Kiné]', '[Kiné]');
    if (this.kine && this.kine.email) push(this.kine.email, '[Kiné]', false);
    return [...forms.values()];
  }

  _tokenFor(value, type) {
    const key = fold(value).trim().replace(/\s+/g, ' ');
    const known = this.byValue.get(key);
    if (known) return known;
    let token;
    if (type === 'Patient' && !this.patientAssigned) {
      token = '[Patient]';
      this.patientAssigned = true;
    } else {
      this.tiers += 1;
      token = `[Tiers ${this.tiers}]`;
    }
    this.byValue.set(key, token);
    this.table.set(token, value);
    return token;
  }

  _count(type) { this.counts[type] = (this.counts[type] || 0) + 1; }

  /** Jeton d'identité connue correspondant à une valeur pliée (exact, sinon approché), sinon null. */
  _resolveKnown(foldedValue) {
    const exact = this.formsByString.get(foldedValue);
    if (exact) return exact;
    if (foldedValue.includes(' ') || foldedValue.length < 4) return null;
    let best = null;
    for (const form of this.knownForms) {
      // Le marqueur lexical écarte déjà le faux positif : un mot courant est ici comparé comme les autres
      if (form.words !== 1 || form.letters < 5) continue;
      const distance = damerauLevenshtein(foldedValue, form.form);
      if (distance <= approxThreshold(form.letters) && (!best || distance < best.distance)) best = { distance, token: form.token };
    }
    return best ? best.token : null;
  }

  _matchKnown(src, folded, spans) {
    for (const form of this.knownForms) {
      for (const [start, end] of findForm(folded, form.form)) {
        // Un nom qui est aussi un mot courant n'est pris qu'avec une majuscule ou derrière une civilité
        if (form.common && !/\p{Lu}/u.test(src[start]) && !precededByCivility(folded, start)) continue;
        spans.push({ start, end, token: form.token });
      }
    }
    const approxForms = this.knownForms.filter((f) => f.approx);
    if (approxForms.length) {
      for (const m of folded.matchAll(new RegExp(`[${LETTER}]+`, 'gu'))) {
        if (m[0].length < 4) continue;
        let best = null;
        for (const form of approxForms) {
          const distance = damerauLevenshtein(m[0], form.form);
          if (distance <= approxThreshold(form.letters) && (!best || distance < best.distance)) best = { distance, token: form.token };
        }
        if (best) spans.push({ start: m.index, end: m.index + m[0].length, token: best.token });
      }
    }
    for (const form of this.birthForms) {
      for (const [start, end] of findForm(folded, form)) this._pushPattern(src, spans, start, end, '[Date de naissance]');
    }
  }

  _pushPattern(src, spans, start, end, token) {
    if (end <= start) return;
    spans.push({ start, end, token });
    if (!this.table.has(token)) this.table.set(token, src.slice(start, end));
  }

  _matchPatterns(src, folded, spans) {
    for (const [re, token] of [[PHONE_RE, '[Téléphone]'], [EMAIL_RE, '[E-mail]'], [NIR_RE, '[NIR]'], [POSTAL_CITY_RE, '[Adresse]']]) {
      for (const m of src.matchAll(re)) this._pushPattern(src, spans, m.index, m.index + m[0].length, token);
    }
    for (const m of src.matchAll(URL_RE)) {
      let end = m.index + m[0].length;
      while (end > m.index && TRAILING_PUNCT.includes(src[end - 1])) end -= 1;
      this._pushPattern(src, spans, m.index, end, '[URL]');
    }
    for (const m of folded.matchAll(FOLDER_RE)) this._pushPattern(src, spans, m.index, m.index + m[0].length, '[Numéro]');
    for (const m of folded.matchAll(STREET_RE)) {
      let end = m.index + m[0].length;
      for (let word = 0; word < 6; word += 1) {
        const next = folded.slice(end).match(/^[ \t]+([^\s.,;:!?\n]+)/);
        if (!next || ADDRESS_STOP.has(next[1])) break;
        end += next[0].length;
      }
      this._pushPattern(src, spans, m.index, end, '[Adresse]');
    }
    // Une date complète derrière « né(e) » ou « naissance » est une date de naissance, qu'elle soit
    // celle de la fiche ou non ; une date sans ce marqueur reste (spec §4.2 et §4.4).
    for (const [start, end] of birthDateSegments(folded)) {
      if (DIGITS_DATE_RE.test(wordsToDigits(folded.slice(start, end)))) this._pushPattern(src, spans, start, end, '[Date de naissance]');
    }
  }

  _matchContext(src, folded, spans) {
    const candidates = [];
    const capturable = (start, end) => {
      const word = src.slice(start, end);
      if (!isCapitalized(word)) return false;
      const key = folded.slice(start, end);
      return !CIVILITIES.includes(key) && !MONTHS.includes(key) && !CLINICAL_EPONYMS.has(key);
    };
    for (const [re, anchor] of [[CIVILITY_RE, true], [ROLE_RE, false], [LINK_RE, false], [PRESENTATION_RE, true]]) {
      for (const m of folded.matchAll(re)) {
        const first = m.indices[1];
        if (!first || !capturable(first[0], first[1])) continue;
        const second = m.indices[2];
        const end = second && capturable(second[0], second[1]) ? second[1] : first[1];
        candidates.push({ start: first[0], end, anchor });
      }
    }
    // Numérotation par ordre de première apparition dans le texte, pas par ordre des règles
    candidates.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
    const resolved = [];
    for (const candidate of candidates) {
      if (resolved.some((r) => candidate.start < r.end && r.start < candidate.end)) continue;
      const value = src.slice(candidate.start, candidate.end);
      const token = this._resolveKnown(folded.slice(candidate.start, candidate.end))
        || this._tokenFor(value, this.freeMode && candidate.anchor ? 'Patient' : 'Tiers');
      resolved.push({ start: candidate.start, end: candidate.end });
      spans.push({ start: candidate.start, end: candidate.end, token });
    }
    // Une valeur déjà jetonnée est remplacée partout où elle réapparaît sans marqueur (« Lucas encore »)
    for (const [key, token] of this.byValue) {
      for (const [start, end] of findForm(folded, key)) {
        if (/\p{Lu}/u.test(src[start])) spans.push({ start, end, token });
      }
    }
  }

  mask(text) {
    const src = String(text ?? '');
    if (!src) return src;
    const folded = fold(src);
    const spans = [];   // { start, end, token }
    this._matchKnown(src, folded, spans);
    this._matchPatterns(src, folded, spans);
    this._matchContext(src, folded, spans);
    // Chevauchements : le plus long d'abord, puis le plus à gauche ; un span déjà couvert est ignoré
    spans.sort((a, b) => (b.end - b.start) - (a.end - a.start) || a.start - b.start);
    const kept = []; const taken = tokenSpans(src);
    for (const s of spans) { if (taken.some((t) => s.start < t.end && t.start < s.end)) continue; kept.push(s); taken.push(s); }
    kept.sort((a, b) => b.start - a.start);
    let out = src;
    for (const s of kept) { out = out.slice(0, s.start) + s.token + out.slice(s.end); for (const type of tokenTypes(s.token)) this._count(type); }
    return out;
  }

  /**
   * Valeur d'un jeton. `verbatim` rend l'identité telle qu'elle a été saisie (citations et valeurs
   * d'extraction, qui doivent reproduire le texte d'origine) ; sinon rendu « document » du bilan
   * rédigé : nom en capitales. Un jeton inconnu vaut null et reste en clair.
   */
  _render(token, verbatim) {
    const first = this.patient && this.patient.firstName ? String(this.patient.firstName) : null;
    const last = this.patient && this.patient.lastName ? String(this.patient.lastName) : null;
    switch (token) {
      case '[Prénom]': return first;
      case '[NOM]': return last === null ? null : (verbatim ? last : last.toUpperCase());
      case '[âge]': {
        const age = this.patient ? computeAge(this.patient.birthDate, this.at) : null;
        return age === null ? null : String(age);
      }
      case '[Kiné]': {
        if (!this.kine) return null;
        const name = `${this.kine.firstName || ''} ${this.kine.lastName || ''}`.trim();
        return name || null;
      }
      case '[Date de naissance]': {
        const born = this.patient && this.patient.birthDate ? new Date(this.patient.birthDate) : null;
        if (!born || Number.isNaN(born.getTime())) return this.table.get(token) || null;
        return `${pad2(born.getUTCDate())}/${pad2(born.getUTCMonth() + 1)}/${born.getUTCFullYear()}`;
      }
      default: return this.table.get(token) || null;
    }
  }

  _unmask(text, verbatim) {
    return String(text ?? '').replace(TOKEN_RE, (token) => {
      const value = this._render(token, verbatim);
      return value === null ? token : value;
    });
  }

  unmask(text) { return this._unmask(text, false); }

  unmaskDeep(value) {
    if (typeof value === 'string') return this._unmask(value, true);
    if (Array.isArray(value)) return value.map((item) => this.unmaskDeep(item));
    if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, this.unmaskDeep(item)]));
    }
    return value;
  }

  stats() { return { ...this.counts }; }
}

const createPseudonymizer = (options = {}) => new Pseudonymizer(options);

module.exports = { createPseudonymizer, computeAge, TOKEN_TYPES };
