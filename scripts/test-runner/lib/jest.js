const { stripAnsi } = require('./util');

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

module.exports = { parseJestResults };
