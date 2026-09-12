#!/usr/bin/env node
// Qualité de la chaîne de séance : transcription (asr-worker/eval/out) → correction (session) →
// extraction sur le dialogue corrigé → rédaction des sept sections depuis ce même dialogue
// (bilanComposeService, source « dialogue »).
// Usage : npm run eval:session [-- --variant cabinet] [-- --only seance-03] [-- --json out.json]
//   [-- --dump dossier]
// --dump : écrit les sections rédigées dans <dossier>/<cas>_<variante>.md pour les relire.
//   Corpus synthétique uniquement : jamais d'audio ni de texte de patient réel ici.
// Vrai provider IA (coût), corpus synthétique uniquement. Seuils d'ouverture du bouton (spec §6) :
// sections attendues rédigées ≥ 80 %, rappel d'extraction ≥ 85 %, aucun cas en erreur (variante clean).
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { loadSeedFile } = require('../../services/bilanSeedService');
const { correct } = require('../../services/dictationCorrectionService');
const { composeSections } = require('../../services/bilanComposeService');
const { applyCandidates } = require('../../services/bilanExtractionService');
const { SECTION_KEYS, SECTION_TITLES } = require('../../services/bilanDocument');
const { createPseudonymizer, fold } = require('../../services/pseudonymService');
const llmService = require('../../services/llmService');
const { runCase, printResult, summarize, installLeakGuard, identityOf, formatStats, leakLine } = require('../extraction/lib');
const cases = require('./cases.json');
// Kiné synthétique des harnais (jamais un vrai kiné) : masqué comme le patient, jamais envoyé au modèle.
const KINE_IDENTITY = { firstName: 'Valentin', lastName: 'Durand', email: null };

const args = process.argv.slice(2);
const arg = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const only = arg('--only');
const variant = arg('--variant') || 'clean';
const jsonOut = arg('--json');
const dumpDir = arg('--dump');
const ROOT = path.join(__dirname, '..', '..', '..');
const THRESHOLDS = { sectionsRecall: 0.8, extractionRecall: 0.85 };
const EMPTY_DOC = { schemaVersion: 1, sections: [], measurements: [] };

function dump(id, sections, warnings) {
  if (!dumpDir) return;
  fs.mkdirSync(dumpDir, { recursive: true });
  const body = SECTION_KEYS.map((k) => `## ${SECTION_TITLES[k]}${warnings[k] ? ` (${warnings[k]})` : ''}\n\n${sections[k] || '(vide)'}`).join('\n\n');
  fs.writeFileSync(path.join(dumpDir, `${id}_${variant}.md`), `# ${id} — ${variant}\n\n${body}\n`);
}

(async () => {
  const seed = loadSeedFile();
  if (!seed) { console.error('Seed illisible'); process.exit(2); }
  const catalog = seed.fields.map((f) => ({ isActive: true, ...f }));
  const results = [];
  const sectionStats = { expected: 0, found: 0, unexpected: 0, warnings: 0 };
  console.log('Chaîne de séance : correction → extraction sur le dialogue → rédaction depuis le dialogue');
  const selected = cases.filter((x) => !only || x.id === only);
  // Une identité par cas ; les formes interdites de chaque cas ne se recoupent jamais (patients
  // distincts), donc une seule garde globale posée avant Promise.all — avec l'union des formes de
  // tous les cas — suffit : chaque cas ne relit que ses propres formes dans `guard.leaks` en fin de
  // chaîne (`runOne` n'y accède qu'après avoir attendu tous ses propres appels au modèle, la garde y
  // a donc déjà consigné ses éventuelles fuites). C'est la solution la plus simple qui garde
  // l'attribution par cas sans poser/retirer une garde par appel concurrent.
  const identities = new Map(selected.map((k) => [k.id, identityOf(k)]));
  // L'attribution par cas ci-dessous (une garde globale, relue avec les formes propres à chaque cas)
  // suppose qu'aucune forme interdite n'est partagée entre deux cas ; vérifié explicitement plutôt
  // que supposé silencieusement — jamais la valeur de la forme dans le message d'erreur.
  const formOwner = new Map();
  for (const kase of selected) {
    for (const f of identities.get(kase.id)) {
      const folded = fold(f.form);
      const owner = formOwner.get(folded);
      if (owner && owner !== kase.id) {
        console.error(`Formes interdites partagées entre deux cas (${owner} et ${kase.id}) : l'attribution des fuites par cas ne serait plus fiable.`);
        process.exit(2);
      }
      formOwner.set(folded, kase.id);
    }
  }
  const allForms = [...new Set(selected.flatMap((k) => identities.get(k.id).map((f) => f.form)))];
  const guard = installLeakGuard(llmService, allForms);
  // Un cas = une chaîne d'appels ; les cas tournent en parallèle contre le provider et chacun
  // tamponne sa sortie pour l'imprimer d'un bloc, dans l'ordre du corpus
  async function runOne(kase) {
    const buf = [];
    const out = { write: (t) => buf.push(t), log: (t) => buf.push(`${t}\n`) };
    const pseudo = createPseudonymizer({ patient: kase.identity, kine: KINE_IDENTITY, at: new Date() });
    const result = await (async () => {
      const file = path.join(ROOT, kase.transcript.replace(/_clean\.txt$/, `_${variant}.txt`));
      out.write(`▶ ${kase.id} — ${kase.title} (${variant}) … `);
      if (!fs.existsSync(file)) { out.log(`ABSENT ${path.relative(ROOT, file)} (lancer asr-worker/eval/bench.py --only seance)`); return { id: kase.id, error: 'transcription absente' }; }
      try {
        const transcript = fs.readFileSync(file, 'utf8');
        const words = transcript.split(/\s+/).filter(Boolean).length;
        const c = await correct({ text: transcript, mode: 'session', catalog, pseudo });
        const expected = kase.expectSections || [];
        out.write(`\n   dialogue ${words} mots · correction ${c.applied}/${c.ignored}\n   extraction … `);
        const x = await runCase({ ...kase, notes: c.text, pseudo }, catalog);
        printResult(x, out.log);
        // Comme en production : les mesures acceptées entrent au document avant la rédaction (tableau exclu de la prose)
        const { document, accepted } = applyCandidates(EMPTY_DOC, x.candidates);
        const t0 = Date.now();
        const composed = await composeSections({ bilanId: kase.id, type: kase.type, motif: kase.motif, notes: c.text, document, catalog, keys: SECTION_KEYS, source: 'dialogue', pseudo });
        const sections = composed.texts;
        const warned = Object.keys(composed.warnings);
        sectionStats.warnings += warned.length;
        const got = SECTION_KEYS.filter((k) => sections[k]);
        const found = expected.filter((k) => got.includes(k));
        const unexpected = got.filter((k) => !expected.includes(k));
        sectionStats.expected += expected.length; sectionStats.found += found.length; sectionStats.unexpected += unexpected.length;
        out.log(`   rédaction ${got.length}/7 sections en ${((Date.now() - t0) / 1000).toFixed(1)} s (${Object.values(sections).join(' ').split(/\s+/).filter(Boolean).length} mots, ${accepted.length} mesure(s) en tableau) · attendues ${found.length}/${expected.length}${unexpected.length ? ` · inattendues ${unexpected.join(', ')}` : ''}${warned.length ? ` · avertissements ${warned.map((k) => `${k}=${composed.warnings[k]}`).join(', ')}` : ''}`);
        dump(kase.id, sections, composed.warnings);
        delete x.candidates;
        x.sections = { expected, found, unexpected, warnings: composed.warnings };
        return x;
      } catch (err) {
        out.log(`ERREUR ${err.code || ''} ${err.message}`);
        return { id: kase.id, error: err.message };
      }
    })();
    const myForms = new Set(identities.get(kase.id).map((f) => f.form));
    const myLeaks = guard.leaks.filter((l) => myForms.has(l));
    const line = leakLine(myLeaks, identities.get(kase.id));
    if (line) {
      result.error = result.error ? `${result.error} ; ${line}` : line;
      out.log(`   ${line}`);
    }
    out.log(`   ${formatStats(pseudo.stats())}`);
    return { result, text: buf.join('') };
  }
  const runs = await Promise.all(selected.map(runOne));
  guard.restore();
  for (const r of runs) { process.stdout.write(r.text); if (!r.text.endsWith('\n')) console.log(); results.push(r.result); }
  const code = summarize(results);
  const ok = results.filter((r) => !r.error);
  const sectionsRecall = sectionStats.expected ? sectionStats.found / sectionStats.expected : 0;
  const extractionRecall = ok.length ? ok.reduce((s, r) => s + r.recall, 0) / ok.length : 0;
  // Les avertissements sont informatifs (nombre non vérifié, doublon du tableau) : pas de seuil
  console.log(`Sections attendues rédigées ${(sectionsRecall * 100).toFixed(1)} % · sections avec nombre non vérifié ou doublon de tableau ${sectionStats.warnings} · rappel d'extraction moyen ${(extractionRecall * 100).toFixed(1)} %`);
  // Un cas en erreur (transcription absente, provider en échec) n'est pas une réussite : les seuils
  // ne portent que sur les cas aboutis, la moyenne ne doit pas masquer un cas qui n'a pas tourné
  const pass = sectionsRecall >= THRESHOLDS.sectionsRecall && extractionRecall >= THRESHOLDS.extractionRecall && !results.some((r) => r.error);
  console.log(pass ? 'Seuils d’ouverture : ATTEINTS' : 'Seuils d’ouverture : NON ATTEINTS');
  if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify({ date: new Date().toISOString(), variant, provider: process.env.GENERATION_PROVIDER || 'openai', sectionStats, results }, null, 2));
  process.exit(pass ? code : 1);
})();
