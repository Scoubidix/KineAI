// Logique partagée des harnais d'évaluation de l'extraction (notes et dictées).
const { extractFromText, normalizeText } = require('../../services/bilanExtractionService');

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
  const { candidates, rejected } = await extractFromText({ rawNotes: c.notes, motif: c.motif ?? null, catalog, document: { schemaVersion: 1, sections: [], measurements: [] }, logContext: c.id });
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
  return { id: c.id, title: c.title, recall, missing, wrong, forbidden, forbiddenValues, customMissing, extras, rejected, custom: custom.map((x) => `${x.label} = ${x.value}`) };
}

function printResult(r) {
  const errors = r.forbidden.length + r.forbiddenValues.length + r.customMissing.length;
  console.log(`rappel ${(r.recall * 100).toFixed(0)} %${errors ? ` · ${errors} interdit(s)` : ''} · ${r.extras.length} extra(s) · ${r.rejected} écarté(s)`);
  for (const m of r.missing) console.log(`   manquant   ${m}`);
  for (const w of r.wrong) console.log(`   valeur     ${w}`);
  for (const f of r.forbidden) console.log(`   INTERDIT   ${f}`);
  for (const v of r.forbiddenValues) console.log(`   INTERDIT   valeur ${v}`);
  for (const s of r.customMissing) console.log(`   custom absent : ${s}`);
  for (const e of r.extras) console.log(`   extra      ${e}`);
  for (const x of r.custom) console.log(`   libre      ${x}`);
}

/** Rappel moyen et total d'interdits ; code de sortie 1 si un interdit, une erreur ou aucun cas. */
function summarize(results) {
  const ok = results.filter((r) => !r.error);
  const avg = ok.length ? ok.reduce((s, r) => s + r.recall, 0) / ok.length : 0;
  const errors = ok.reduce((s, r) => s + r.forbidden.length + r.forbiddenValues.length + r.customMissing.length, 0);
  console.log(`\nRappel moyen ${(avg * 100).toFixed(1)} % sur ${ok.length} cas · ${errors} interdit(s) au total`);
  return errors > 0 || results.length === 0 || results.some((r) => r.error) ? 1 : 0;
}

module.exports = { parseExpect, sameValue, runCase, printResult, summarize };
