#!/usr/bin/env node
// Qualité d'extraction sur les transcriptions de dictée (asr-worker/eval/out, produites par bench.py).
// Usage : npm run eval:dictation [-- --variant cabinet] [-- --only dictee-03] [-- --json out.json] [-- --correct]
// Vrai provider IA (coût), corpus synthétique uniquement.
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { loadSeedFile } = require('../../services/bilanSeedService');
const { correct } = require('../../services/dictationCorrectionService');
const { createPseudonymizer } = require('../../services/pseudonymService');
const llmService = require('../../services/llmService');
const { runCase, printResult, summarize, installLeakGuard, identityOf, formatStats } = require('../extraction/lib');
const cases = require('./cases.json');
// Kiné synthétique des harnais (jamais un vrai kiné) : masqué comme le patient, jamais envoyé au modèle.
const KINE_IDENTITY = { firstName: 'Valentin', lastName: 'Durand', email: null };

const args = process.argv.slice(2);
const arg = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const only = arg('--only');
const variant = arg('--variant') || 'clean';
const jsonOut = arg('--json');
const withCorrection = args.includes('--correct');
const ROOT = path.join(__dirname, '..', '..', '..');
// Termes de référence (mêmes que TERMES du bench), comptés avant et après correction
const TERMES = ['lasègue', 'schober', 'sorensen', 'mckenzie', 'kinésiophobie', 'supra-épineux', 'didt', 'lachman', 'spurling', 'phalen', 'tinel', 'jamar', 'dn4', 'kleiger', 'thompson', 'knee to wall', 'fibulaires', 'ottawa'];
const termHits = (t) => TERMES.filter((x) => t.toLowerCase().includes(x)).length;

(async () => {
  const seed = loadSeedFile();
  if (!seed) { console.error('Seed illisible'); process.exit(2); }
  const catalog = seed.fields.map((f) => ({ isActive: true, ...f }));
  const results = [];
  for (const kase of cases.filter((x) => !only || x.id === only)) {
    const file = path.join(ROOT, kase.transcript.replace(/_clean\.txt$/, `_${variant}.txt`));
    process.stdout.write(`▶ ${kase.id} — ${kase.title} (${variant}) … `);
    if (!fs.existsSync(file)) { console.log(`ABSENT ${path.relative(ROOT, file)} (lancer asr-worker/eval/bench.py)`); results.push({ id: kase.id, error: 'transcription absente' }); continue; }
    const pseudo = createPseudonymizer({ patient: kase.identity, kine: KINE_IDENTITY, at: new Date() });
    const identity = identityOf(kase);
    const guard = installLeakGuard(llmService, identity.map((f) => f.form));
    try {
      let notes = fs.readFileSync(file, 'utf8');
      if (withCorrection) {
        const before = termHits(notes);
        const c = await correct({ text: notes, mode: 'dictation', catalog, pseudo });
        notes = c.text;
        console.log(`\n   correction : ${c.applied} appliquée(s), ${c.ignored} ignorée(s) · termes ${before} → ${termHits(notes)} / ${TERMES.length}`);
        process.stdout.write('   extraction … ');
      }
      const r = await runCase({ ...kase, notes, pseudo }, catalog);
      guard.restore();
      if (guard.leaks.length) {
        r.error = `FUITE (${guard.leaks.length})`;
        const types = guard.leaks.map((leak) => identity.find((f) => f.form === leak)?.type || '?');
        console.log(`FUITE (${guard.leaks.length}) : ${types.join(', ')}`);
      } else {
        printResult(r);
      }
      console.log(`   ${formatStats(pseudo.stats())}`);
      results.push(r);
    } catch (err) {
      guard.restore();
      console.log(`ERREUR ${err.code || ''} ${err.message}`);
      results.push({ id: kase.id, error: err.message });
    }
  }
  const code = summarize(results);
  if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify({ date: new Date().toISOString(), variant, provider: process.env.GENERATION_PROVIDER || 'openai', results }, null, 2));
  process.exit(code);
})();
