#!/usr/bin/env node
// Pseudonymisation sur transcriptions courtes (asr-worker/eval/gen_pseudo.py) : pour chaque clip, affiche la
// transcription, le texte masqué tel qu'il partirait au modèle, les jetons posés et la réhydratation.
// Déterministe, aucun appel au provider, corpus synthétique uniquement (c'est pour cela que le texte
// s'affiche ici, contrairement aux logs applicatifs). Usage : npm run eval:pseudonym [-- --only pseudo-03]
const fs = require('fs');
const path = require('path');
const { createPseudonymizer } = require('../../services/pseudonymService');
const cases = require('./cases.json');

const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const ROOT = path.join(__dirname, '..', '..', '..');
const AT = new Date('2026-09-12T12:00:00Z');

let failures = 0;
for (const kase of cases.filter((c) => !only || c.id === only)) {
  const file = path.join(ROOT, kase.transcript);
  console.log(`\n▶ ${kase.id} — ${kase.title}`);
  if (!fs.existsSync(file)) { console.log('   ABSENT (lancer asr-worker/eval/gen_pseudo.py)'); failures += 1; continue; }
  const transcript = fs.readFileSync(file, 'utf8').trim();
  const patient = kase.identity ? { ...kase.identity, birthDate: new Date(kase.identity.birthDate) } : null;
  const pseudo = createPseudonymizer({ patient, kine: kase.kine, at: AT });
  const masked = pseudo.mask(transcript);
  const stats = pseudo.stats();
  const statsLine = Object.entries(stats).map(([t, n]) => `${t} ×${n}`).join(', ') || 'aucun';
  const missing = (kase.expectTokens || []).filter((t) => !stats[t]);
  const lost = (kase.keep || []).filter((k) => !masked.toLowerCase().includes(k.toLowerCase()));
  // Une identité qui est aussi un mot courant (« Petit », « Martin ») n'est une fuite que capitalisée :
  // « un petit gonflement » doit rester intact, c'est la garde anti-faux-positif du service.
  const leaks = [];
  if (kase.identity) {
    for (const v of [kase.identity.firstName, kase.identity.lastName]) {
      const common = (kase.commonWords || []).some((w) => w.toLowerCase() === String(v).toLowerCase());
      const re = new RegExp(`(?<![\\p{L}])${v}(?![\\p{L}])`, common ? 'u' : 'iu');
      if (re.test(masked)) leaks.push('identité');
    }
  }
  console.log(`   transcrit : ${transcript}`);
  console.log(`   masqué    : ${masked}`);
  console.log(`   jetons    : ${statsLine}`);
  console.log(`   réhydraté : ${pseudo.unmaskDeep(masked)}`);
  if (missing.length) console.log(`   ✗ jetons attendus absents : ${missing.join(', ')}`);
  if (lost.length) console.log(`   ✗ contenu clinique perdu : ${lost.join(', ')}`);
  if (leaks.length) console.log('   ✗ FUITE : l’identité du cas est encore lisible dans le texte masqué');
  if (missing.length || lost.length || leaks.length) failures += 1; else console.log('   ✓');
}
console.log(`\n${cases.length - failures}/${cases.length} clips conformes`);
process.exit(failures ? 1 : 0);
