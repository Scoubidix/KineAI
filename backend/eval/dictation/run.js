#!/usr/bin/env node
// Qualité d'extraction sur les transcriptions de dictée (asr-worker/eval/out, produites par bench.py).
// Usage : npm run eval:dictation [-- --variant cabinet] [-- --only dictee-03] [-- --json out.json]
// Vrai provider IA (coût), corpus synthétique uniquement.
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { loadSeedFile } = require('../../services/bilanSeedService');
const { runCase, printResult, summarize } = require('../extraction/lib');
const cases = require('./cases.json');

const args = process.argv.slice(2);
const arg = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const only = arg('--only');
const variant = arg('--variant') || 'clean';
const jsonOut = arg('--json');
const ROOT = path.join(__dirname, '..', '..', '..');

(async () => {
  const seed = loadSeedFile();
  if (!seed) { console.error('Seed illisible'); process.exit(2); }
  const catalog = seed.fields.map((f) => ({ isActive: true, ...f }));
  const results = [];
  for (const c of cases.filter((x) => !only || x.id === only)) {
    const file = path.join(ROOT, c.transcript.replace(/_clean\.txt$/, `_${variant}.txt`));
    process.stdout.write(`▶ ${c.id} — ${c.title} (${variant}) … `);
    if (!fs.existsSync(file)) { console.log(`ABSENT ${path.relative(ROOT, file)} (lancer asr-worker/eval/bench.py)`); results.push({ id: c.id, error: 'transcription absente' }); continue; }
    try {
      const r = await runCase({ ...c, notes: fs.readFileSync(file, 'utf8') }, catalog);
      results.push(r);
      printResult(r);
    } catch (err) {
      console.log(`ERREUR ${err.code || ''} ${err.message}`);
      results.push({ id: c.id, error: err.message });
    }
  }
  const code = summarize(results);
  if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify({ date: new Date().toISOString(), variant, provider: process.env.GENERATION_PROVIDER || 'openai', results }, null, 2));
  process.exit(code);
})();
