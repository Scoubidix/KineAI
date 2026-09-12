// Logique partagée des harnais d'évaluation de l'extraction (notes et dictées).
const { extractFromText, normalizeText } = require('../../services/bilanExtractionService');
const { fold, dateForms } = require('../../services/pseudonymService');

function parseExpect(s) {
  const [left, rawValue] = s.split('=');
  const [key, side] = left.split(':');
  let value;
  if (rawValue === 'true' || rawValue === 'false') value = rawValue === 'true';
  else if (/^-?\d+(?:\.\d+)?$/.test(rawValue)) value = parseFloat(rawValue);
  else value = rawValue;
  return { key, side: side || null, value };
}
const sameValue = (got, exp) => {
  if (typeof exp === 'string' && exp.startsWith('~')) return normalizeText(String(got)).includes(normalizeText(exp.slice(1)));
  if (typeof exp === 'string') return normalizeText(String(got)) === normalizeText(exp);
  return got === exp;
};

async function runCase(c, catalog) {
  const { candidates, rejected } = await extractFromText({ rawNotes: c.notes, motif: c.motif ?? null, catalog, document: { schemaVersion: 1, sections: [], measurements: [] }, logContext: c.id, pseudo: c.pseudo });
  const canon = candidates.filter((x) => x.kind === 'canonical');
  const custom = candidates.filter((x) => x.kind === 'custom');
  const missing = [];
  const wrong = [];
  for (const e of (c.expect || []).map(parseExpect)) {
    const hit = canon.find((x) => x.key === e.key && (x.side ?? null) === e.side);
    if (!hit) missing.push(`${e.key}${e.side ? ':' + e.side : ''}`);
    else if (!sameValue(hit.value, e.value)) wrong.push(`${e.key}${e.side ? ':' + e.side : ''} attendu ${JSON.stringify(e.value)} obtenu ${JSON.stringify(hit.value)}`);
  }
  const forbidden = (c.forbid || []).filter((k) => canon.some((x) => x.key === k));
  const forbiddenValues = (c.forbidValues || []).filter((v) => canon.some((x) => x.fieldType === 'NUMERIC' && x.value === v));
  const customMissing = (c.customContains || []).filter((s) => !custom.some((x) => normalizeText(x.label + ' ' + x.value).includes(normalizeText(s))));
  const expectedKeys = new Set((c.expect || []).map((s) => s.split('=')[0]));
  const extras = canon.filter((x) => !expectedKeys.has(`${x.key}${x.side ? ':' + x.side : ''}`)).map((x) => `${x.key}${x.side ? ':' + x.side : ''}=${JSON.stringify(x.value)}`);
  const total = (c.expect || []).length;
  const recall = total ? (total - missing.length - wrong.length) / total : 1;
  return { id: c.id, title: c.title, recall, missing, wrong, forbidden, forbiddenValues, customMissing, extras, rejected, custom: custom.map((x) => `${x.label} = ${x.value}`), candidates };
}

// `log` : sortie ligne à ligne (console.log par défaut ; un tampon quand les cas tournent en parallèle)
function printResult(r, log = console.log) {
  const errors = r.forbidden.length + r.forbiddenValues.length + r.customMissing.length;
  log(`rappel ${(r.recall * 100).toFixed(0)} %${errors ? ` · ${errors} interdit(s)` : ''} · ${r.extras.length} extra(s) · ${r.rejected} écarté(s)`);
  for (const m of r.missing) log(`   manquant   ${m}`);
  for (const w of r.wrong) log(`   valeur     ${w}`);
  for (const f of r.forbidden) log(`   INTERDIT   ${f}`);
  for (const v of r.forbiddenValues) log(`   INTERDIT   valeur ${v}`);
  for (const s of r.customMissing) log(`   custom absent : ${s}`);
  for (const e of r.extras) log(`   extra      ${e}`);
  for (const x of r.custom) log(`   libre      ${x}`);
}

/** Rappel moyen et total d'interdits ; code de sortie 1 si un interdit, une erreur ou aucun cas. */
function summarize(results) {
  const ok = results.filter((r) => !r.error);
  const avg = ok.length ? ok.reduce((s, r) => s + r.recall, 0) / ok.length : 0;
  const errors = ok.reduce((s, r) => s + r.forbidden.length + r.forbiddenValues.length + r.customMissing.length, 0);
  console.log(`\nRappel moyen ${(avg * 100).toFixed(1)} % sur ${ok.length} cas · ${errors} interdit(s) au total`);
  return errors > 0 || results.length === 0 || results.some((r) => r.error) ? 1 : 0;
}

// ---- Garde anti-fuite (pseudonymisation, spec 2026-09-12 §9) : repère si une forme interdite —
// identité du cas de test, jamais l'identité réelle d'un patient — atteint le modèle malgré le
// masquage. Repli `pseudonymService.fold` (accents, casse, apostrophes/tirets → espace) ;
// recherche en mot entier ; l'appel continue toujours (on mesure, on ne bloque pas).
const LETTER = '\\p{L}\\p{M}';
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const formRegex = (foldedForm) => new RegExp(`(?<![${LETTER}])${foldedForm.split(/\s+/).map(escapeRe).join('\\s+')}(?![${LETTER}])`, 'u');

/**
 * Enveloppe `llmService.chatCompletion` : pour chaque appel, cherche chaque forme interdite (pliée,
 * mot entier) dans le texte des messages envoyés. Une occurrence → `leaks.push(form)` (dédoublonné,
 * une seule fois par forme). Ne bloque jamais l'appel. `restore()` remet la fonction d'origine.
 */
function installLeakGuard(llmService, forbidden) {
  const original = llmService.chatCompletion;
  const forms = [...new Set((forbidden || []).map((f) => String(f ?? '').trim()).filter(Boolean))];
  const compiled = forms.map((form) => ({ form, re: formRegex(fold(form)) }));
  const leaks = [];
  llmService.chatCompletion = function guarded() {
    const params = arguments[0];
    const text = fold((params?.messages || []).map((m) => String(m?.content ?? '')).join('\n'));
    for (const { form, re } of compiled) { if (!leaks.includes(form) && re.test(text)) leaks.push(form); }
    return original.apply(this, arguments);
  };
  return { leaks, restore() { llmService.chatCompletion = original; } };
}

// Nombre en toutes lettres (0 à 9999) : une date de naissance dictée l'est presque toujours ainsi
// (« née le trois mars mille neuf cent quatre-vingt »), et le harnais doit la reconnaître comme fuite.
const UNITS_FR = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
const TENS_FR = { 20: 'vingt', 30: 'trente', 40: 'quarante', 50: 'cinquante', 60: 'soixante', 80: 'quatre-vingt' };
function spellFrench(n) {
  if (n < 20) return UNITS_FR[n];
  if (n < 100) {
    const base = n < 70 ? Math.floor(n / 10) * 10 : (n < 80 ? 60 : 80);
    const rest = n - base;
    if (!rest) return TENS_FR[base] + (base === 80 ? 's' : '');
    return `${TENS_FR[base]}${rest === 1 && base < 80 ? ' et ' : '-'}${spellFrench(rest)}`;
  }
  if (n < 1000) {
    const hundreds = Math.floor(n / 100);
    const rest = n % 100;
    return `${hundreds > 1 ? `${UNITS_FR[hundreds]} ` : ''}cent${!rest && hundreds > 1 ? 's' : ''}${rest ? ` ${spellFrench(rest)}` : ''}`;
  }
  const thousands = Math.floor(n / 1000);
  const rest = n % 1000;
  return `${thousands > 1 ? `${UNITS_FR[thousands]} ` : ''}mille${rest ? ` ${spellFrench(rest)}` : ''}`;
}
const MONTHS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** Formes d'une date de naissance : canoniques (jj/mm/aaaa et variantes) + « trois mars mille neuf cent quatre-vingt ». */
function birthDateForms(birthDate) {
  if (!birthDate) return [];
  const date = birthDate instanceof Date ? birthDate : new Date(birthDate);
  if (Number.isNaN(date.getTime())) return [];
  const spelled = `${spellFrench(date.getUTCDate())} ${MONTHS_FR[date.getUTCMonth()]} ${spellFrench(date.getUTCFullYear())}`;
  // Dans une date, l'usage écrit « mille neuf cent quatre-vingt » sans s : les deux formes comptent
  const singular = spelled.replace(/vingts/g, 'vingt').replace(/cents/g, 'cent');
  return [...new Set([...dateForms(date), spelled, singular])];
}

/**
 * Formes interdites d'un cas et leur type, pour attribuer une fuite sans jamais imprimer sa valeur :
 * prénom, nom et date de naissance de l'identité synthétique du cas, puis les tiers repérés dans le
 * corpus (`mustNotReachModel`).
 */
function identityOf(kase) {
  const identity = kase.identity || {};
  const forms = [];
  if (identity.firstName) forms.push({ form: String(identity.firstName), type: 'Prénom' });
  if (identity.lastName) forms.push({ form: String(identity.lastName), type: 'NOM' });
  for (const form of birthDateForms(identity.birthDate)) forms.push({ form, type: 'Date de naissance' });
  for (const m of kase.mustNotReachModel || []) if (m) forms.push({ form: String(m), type: 'Tiers' });
  return forms;
}

/** Ligne « jetons : NOM ×2, Tiers ×1 » à partir de `pseudo.stats()` — jamais de valeur. */
function formatStats(stats) {
  const entries = Object.entries(stats || {});
  return `jetons : ${entries.length ? entries.map(([type, n]) => `${type} ×${n}`).join(', ') : 'aucun'}`;
}

/** Ligne « FUITE (n) : Type1, Type2 » à partir des `leaks` d'une garde et de `identityOf(kase)` ; null si aucune fuite. */
function leakLine(leaks, identity) {
  if (!leaks || !leaks.length) return null;
  const types = leaks.map((leak) => identity.find((f) => f.form === leak)?.type || '?');
  return `FUITE (${leaks.length}) : ${types.join(', ')}`;
}

module.exports = { parseExpect, sameValue, runCase, printResult, summarize, installLeakGuard, identityOf, formatStats, leakLine };
