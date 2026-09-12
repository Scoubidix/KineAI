#!/usr/bin/env node
// Qualité de la chaîne de séance : transcription (asr-worker/eval/out) → correction (session) → compte rendu →
// extraction. Usage : npm run eval:session [-- --variant cabinet] [-- --only seance-03] [-- --json out.json]
// Vrai provider IA (coût), corpus synthétique uniquement. Seuils d'ouverture du bouton (spec §6) :
// 0 nombre inventé, sections attendues ≥ 80 %, rappel d'extraction ≥ 85 % (variante clean).
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { loadSeedFile } = require('../../services/bilanSeedService');
const { correct } = require('../../services/dictationCorrectionService');
const { report } = require('../../services/sessionReportService');
const { SECTION_KEYS } = require('../../services/bilanDocument');
const { runCase, printResult, summarize } = require('../extraction/lib');
const cases = require('./cases.json');

const args = process.argv.slice(2);
const arg = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const only = arg('--only');
const variant = arg('--variant') || 'clean';
const jsonOut = arg('--json');
const ROOT = path.join(__dirname, '..', '..', '..');
const THRESHOLDS = { sectionsRecall: 0.8, extractionRecall: 0.85, invented: 0 };

(async () => {
  const seed = loadSeedFile();
  if (!seed) { console.error('Seed illisible'); process.exit(2); }
  const catalog = seed.fields.map((f) => ({ isActive: true, ...f }));
  const results = [];
  const sectionStats = { expected: 0, found: 0, unexpected: 0, dropped: 0, sentencesDropped: 0 };
  for (const kase of cases.filter((x) => !only || x.id === only)) {
    const file = path.join(ROOT, kase.transcript.replace(/_clean\.txt$/, `_${variant}.txt`));
    process.stdout.write(`▶ ${kase.id} — ${kase.title} (${variant}) … `);
    if (!fs.existsSync(file)) { console.log(`ABSENT ${path.relative(ROOT, file)} (lancer asr-worker/eval/bench.py --only seance)`); results.push({ id: kase.id, error: 'transcription absente' }); continue; }
    try {
      const transcript = fs.readFileSync(file, 'utf8');
      const words = transcript.split(/\s+/).filter(Boolean).length;
      const c = await correct({ text: transcript, mode: 'session', catalog });
      const t0 = Date.now();
      const r = await report({ transcript: c.text, motif: kase.motif, type: kase.type, catalog });
      const got = SECTION_KEYS.filter((k) => r.sections[k]);
      const expected = kase.expectSections || [];
      const found = expected.filter((k) => got.includes(k));
      const unexpected = got.filter((k) => !expected.includes(k));
      sectionStats.expected += expected.length; sectionStats.found += found.length; sectionStats.unexpected += unexpected.length; sectionStats.dropped += r.dropped.length; sectionStats.sentencesDropped += r.sentencesDropped;
      console.log(`\n   dialogue ${words} mots · correction ${c.applied}/${c.ignored} · compte rendu ${got.length}/7 sections en ${((Date.now() - t0) / 1000).toFixed(1)} s (${r.notes.split(/\s+/).length} mots) · attendues ${found.length}/${expected.length}${unexpected.length ? ` · inattendues ${unexpected.join(', ')}` : ''}${r.dropped.length ? ` · vidées par la garde ${r.dropped.join(', ')}` : ''} · phrases retirées ${r.sentencesDropped}`);
      process.stdout.write('   extraction … ');
      const x = await runCase({ ...kase, notes: r.notes }, catalog);
      x.sections = { expected, found, unexpected, dropped: r.dropped, sentencesDropped: r.sentencesDropped };
      results.push(x);
      printResult(x);
    } catch (err) {
      console.log(`ERREUR ${err.code || ''} ${err.message}`);
      results.push({ id: kase.id, error: err.message });
    }
  }
  const code = summarize(results);
  const ok = results.filter((r) => !r.error);
  const sectionsRecall = sectionStats.expected ? sectionStats.found / sectionStats.expected : 0;
  const extractionRecall = ok.length ? ok.reduce((s, r) => s + r.recall, 0) / ok.length : 0;
  const invented = sectionStats.dropped;
  console.log(`Sections attendues retrouvées ${(sectionsRecall * 100).toFixed(1)} % · sections vidées par la garde ${invented} · phrases retirées ${sectionStats.sentencesDropped} · rappel d'extraction moyen ${(extractionRecall * 100).toFixed(1)} %`);
  // Un cas en erreur (transcription absente, provider en échec) n'est pas une réussite : les seuils
  // ne portent que sur les cas aboutis, la moyenne ne doit pas masquer un cas qui n'a pas tourné
  const pass = sectionsRecall >= THRESHOLDS.sectionsRecall && extractionRecall >= THRESHOLDS.extractionRecall && invented <= THRESHOLDS.invented && !results.some((r) => r.error);
  console.log(pass ? 'Seuils d’ouverture : ATTEINTS' : 'Seuils d’ouverture : NON ATTEINTS');
  if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify({ date: new Date().toISOString(), variant, provider: process.env.GENERATION_PROVIDER || 'openai', sectionStats, results }, null, 2));
  process.exit(pass ? code : 1);
})();
