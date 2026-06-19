const { stripAnsi } = require('./util');

function basename(p) {
  return String(p || '').split(/[\\/]/).pop();
}

// Parcourt récursivement les suites pour récupérer toutes les specs (avec leur fichier).
function collectSpecs(suite) {
  const specs = (suite.specs || []).slice();
  for (const child of suite.suites || []) {
    specs.push(...collectSpecs(child));
  }
  return specs;
}

function specToResult(spec) {
  const t = (spec.tests && spec.tests[0]) || {};
  const last = (t.results && t.results[t.results.length - 1]) || {};
  let status;
  if (t.status === 'skipped' || last.status === 'skipped') status = 'skipped';
  else if (last.status === 'passed') status = 'passed';
  else status = 'failed';
  const rawError = (last.error && last.error.message) || (last.errors && last.errors[0] && last.errors[0].message) || null;
  return {
    suite: basename(spec.file),
    name: spec.title,
    status,
    durationMs: last.duration || 0,
    error: status === 'failed' && rawError ? stripAnsi(rawError) : null,
  };
}

function parsePlaywrightResults(report) {
  const top = (report && report.suites) || [];
  const out = [];
  for (const suite of top) {
    for (const spec of collectSpecs(suite)) {
      out.push(specToResult(spec));
    }
  }
  return out;
}

module.exports = { parsePlaywrightResults };
