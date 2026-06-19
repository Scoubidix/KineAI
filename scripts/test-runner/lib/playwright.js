const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { stripAnsi, streamLines } = require('./util');
const { FRONTEND_DIR, TMP_DIR } = require('./paths');

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

// Lance Playwright dans frontend/ : reporter list (logs live) + json (fichier).
// NE PAS définir CI → navigateur visible (cf. playwright.config.ts).
function runPlaywright({ onLog } = {}) {
  return new Promise((resolve, reject) => {
    const outFile = path.join(TMP_DIR, 'kineai-playwright-results.json');
    try { fs.rmSync(outFile, { force: true }); } catch (_) {}
    if (onLog) onLog('> npx playwright test (frontend, navigateur visible)');
    const child = spawn('npx', ['playwright', 'test', '--reporter=list,json'], {
      cwd: FRONTEND_DIR,
      shell: true,
      env: { ...process.env, CI: '', PLAYWRIGHT_JSON_OUTPUT_NAME: outFile },
    });
    streamLines(child.stdout, onLog);
    streamLines(child.stderr, onLog);
    // Mémorise une erreur de spawn (ex: npx introuvable) pour la remonter telle quelle, sans la masquer.
    let spawnError = null;
    child.on('error', (e) => { spawnError = e; });
    child.on('close', () => {
      if (spawnError) return reject(spawnError);
      if (!fs.existsSync(outFile)) {
        return reject(new Error('Playwright n\'a pas produit de résultats (échec de lancement ?)'));
      }
      try {
        const report = JSON.parse(fs.readFileSync(outFile, 'utf8'));
        resolve(parsePlaywrightResults(report));
      } catch (e) {
        reject(new Error('Résultats Playwright illisibles : ' + e.message));
      }
    });
  });
}

module.exports = { parsePlaywrightResults, runPlaywright };
