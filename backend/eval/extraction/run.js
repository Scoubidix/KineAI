#!/usr/bin/env node
// Jeu d'évaluation de l'extraction : appelle le VRAI provider (GENERATION_PROVIDER de backend/.env).
// Usage : npm run eval:extraction [-- --only note-05] [-- --json out.json]
// N'entre pas dans npm test (coût, réseau, non déterministe).
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { loadSeedFile } = require('../../services/bilanSeedService');
const { runCase, printResult, summarize } = require('./lib');
const cases = require('./cases.json');

const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;

(async () => {
  const seed = loadSeedFile();
  if (!seed) { console.error('Seed illisible'); process.exit(2); }
  const catalog = seed.fields.map((f) => ({ isActive: true, ...f }));
  const selected = cases.filter((c) => !only || c.id === only);
  const results = [];
  for (const c of selected) {
    process.stdout.write(`▶ ${c.id} — ${c.title} … `);
    try {
      const r = await runCase(c, catalog);
      results.push(r);
      printResult(r);
    } catch (err) {
      console.log(`ERREUR ${err.code || ''} ${err.message}`);
      results.push({ id: c.id, error: err.message });
    }
  }
  const code = summarize(results);
  if (jsonOut) require('fs').writeFileSync(jsonOut, JSON.stringify({ date: new Date().toISOString(), provider: process.env.GENERATION_PROVIDER || 'openai', results }, null, 2));
  process.exit(code);
})();
