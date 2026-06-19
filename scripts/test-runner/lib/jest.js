const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { stripAnsi, streamLines } = require('./util');
const { BACKEND_DIR, TMP_DIR } = require('./paths');

// Jest --json : { testResults: [ { name, assertionResults: [ { title, status, duration, failureMessages } ] } ] }
// status Jest : passed | failed | pending | skipped | todo | disabled
function mapStatus(jestStatus) {
  if (jestStatus === 'passed') return 'passed';
  if (jestStatus === 'failed') return 'failed';
  return 'skipped'; // pending/skipped/todo/disabled
}

function basename(p) {
  return String(p).split(/[\\/]/).pop();
}

function parseJestResults(report) {
  const files = (report && report.testResults) || [];
  const out = [];
  for (const file of files) {
    const suite = basename(file.name);
    for (const a of file.assertionResults || []) {
      const status = mapStatus(a.status);
      const msg = (a.failureMessages && a.failureMessages[0]) || null;
      out.push({
        suite,
        name: a.title,
        status,
        durationMs: a.duration || 0,
        error: status === 'failed' && msg ? stripAnsi(msg) : null,
      });
    }
  }
  return out;
}

// Lance Jest dans backend/ avec sortie JSON dans un fichier temporaire, streame les logs.
function runJest({ onLog } = {}) {
  return new Promise((resolve, reject) => {
    const outFile = path.join(TMP_DIR, 'kineai-jest-results.json');
    try { fs.rmSync(outFile, { force: true }); } catch (_) {}
    if (onLog) onLog('> npx jest --json (backend)');
    const child = spawn('npx', ['jest', '--json', `--outputFile=${outFile}`], {
      cwd: BACKEND_DIR,
      shell: true,
      env: { ...process.env, CI: '' },
    });
    streamLines(child.stdout, onLog);
    streamLines(child.stderr, onLog);
    // Mémorise une erreur de spawn (ex: npx introuvable) pour la remonter telle quelle, sans la masquer.
    let spawnError = null;
    child.on('error', (e) => { spawnError = e; });
    child.on('close', () => {
      if (spawnError) return reject(spawnError);
      // Jest sort en code 1 si des tests échouent : c'est NORMAL, on lit quand même le fichier.
      if (!fs.existsSync(outFile)) {
        return reject(new Error('Jest n\'a pas produit de résultats (crash au démarrage ?)'));
      }
      try {
        const report = JSON.parse(fs.readFileSync(outFile, 'utf8'));
        resolve(parseJestResults(report));
      } catch (e) {
        reject(new Error('Résultats Jest illisibles : ' + e.message));
      }
    });
  });
}

module.exports = { parseJestResults, runJest };
