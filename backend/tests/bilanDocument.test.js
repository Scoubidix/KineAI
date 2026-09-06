const {
  SECTION_KEYS,
  emptyDocument,
  normalizeLabel,
  validateDocument,
} = require('../services/bilanDocument');

const FIELDS = [
  { key: 'eva_repos', type: 'NUMERIC', unit: '/10', rangeMin: 0, rangeMax: 10, lateralized: false, presentation: 'TABLE' },
  { key: 'flexion_genou', type: 'NUMERIC', unit: '°', rangeMin: 0, rangeMax: 160, lateralized: true, presentation: 'TABLE' },
  { key: 'test_lachman', type: 'BOOLEAN', lateralized: true, presentation: 'TABLE' },
  { key: 'testing_quadriceps', type: 'ENUM', options: ['0/5', '1/5', '2/5', '3/5', '4/5', '5/5'], lateralized: true, presentation: 'TABLE' },
  { key: 'antecedents', type: 'TEXT', lateralized: false, presentation: 'NARRATIVE' },
];

const canonical = (over) => ({ kind: 'canonical', presentation: 'table', origin: 'manual', ...over });

describe('bilanDocument — emptyDocument', () => {
  test('7 sections dans l\'ordre, texte vide, aucune mesure', () => {
    const doc = emptyDocument();
    expect(doc.schemaVersion).toBe(1);
    expect(doc.sections.map((s) => s.key)).toEqual(SECTION_KEYS);
    expect(doc.sections.every((s) => s.text === '')).toBe(true);
    expect(doc.measurements).toEqual([]);
    expect(validateDocument(doc, FIELDS).success).toBe(true);
  });
});

describe('bilanDocument — validateDocument', () => {
  const base = () => emptyDocument();

  test('mesure numerique valide avec cote sur champ lateralise', () => {
    const doc = base();
    doc.measurements.push(canonical({ key: 'flexion_genou', value: 120, side: 'D' }));
    expect(validateDocument(doc, FIELDS).success).toBe(true);
  });

  test('cote sur un champ non lateralise → erreur', () => {
    const doc = base();
    doc.measurements.push(canonical({ key: 'eva_repos', value: 5, side: 'D' }));
    const r = validateDocument(doc, FIELDS);
    expect(r.success).toBe(false);
    expect(r.errors.join(' ')).toMatch(/latéralis/);
  });

  test('cle inconnue → erreur', () => {
    const doc = base();
    doc.measurements.push(canonical({ key: 'inexistante', value: 1 }));
    expect(validateDocument(doc, FIELDS).success).toBe(false);
  });

  test('valeur hors bornes → erreur', () => {
    const doc = base();
    doc.measurements.push(canonical({ key: 'eva_repos', value: 11 }));
    expect(validateDocument(doc, FIELDS).success).toBe(false);
  });

  test('ENUM hors options → erreur ; option valide → ok', () => {
    const bad = base();
    bad.measurements.push(canonical({ key: 'testing_quadriceps', value: '6/5', side: 'G' }));
    expect(validateDocument(bad, FIELDS).success).toBe(false);
    const ok = base();
    ok.measurements.push(canonical({ key: 'testing_quadriceps', value: '4/5', side: 'G' }));
    expect(validateDocument(ok, FIELDS).success).toBe(true);
  });

  test('BOOLEAN accepte true/false/null, refuse une chaine', () => {
    const ok = base();
    ok.measurements.push(canonical({ key: 'test_lachman', value: false, side: 'D' }));
    ok.measurements.push(canonical({ key: 'test_lachman', value: null, side: 'G' }));
    expect(validateDocument(ok, FIELDS).success).toBe(true);
    const bad = base();
    bad.measurements.push(canonical({ key: 'test_lachman', value: 'positif', side: 'D' }));
    expect(validateDocument(bad, FIELDS).success).toBe(false);
  });

  test('doublon (key, side) → erreur ; D et G separes → ok', () => {
    const dup = base();
    dup.measurements.push(canonical({ key: 'flexion_genou', value: 100, side: 'D' }));
    dup.measurements.push(canonical({ key: 'flexion_genou', value: 110, side: 'D' }));
    expect(validateDocument(dup, FIELDS).success).toBe(false);
    const ok = base();
    ok.measurements.push(canonical({ key: 'flexion_genou', value: 100, side: 'D' }));
    ok.measurements.push(canonical({ key: 'flexion_genou', value: 110, side: 'G' }));
    expect(validateDocument(ok, FIELDS).success).toBe(true);
  });

  test('custom : label normalise unique, valeur chaine <= 500', () => {
    const doc = base();
    doc.measurements.push({ kind: 'custom', label: 'Schober', value: '3 cm', presentation: 'table', origin: 'extracted' });
    doc.measurements.push({ kind: 'custom', label: ' schober ', value: '4 cm', presentation: 'table', origin: 'manual' });
    expect(validateDocument(doc, FIELDS).success).toBe(false);
    expect(normalizeLabel('  Schober ')).toBe('schober');
  });

  test('sections : cle manquante ou en double → erreur ; texte > 5000 → erreur', () => {
    const missing = base();
    missing.sections = missing.sections.slice(1);
    expect(validateDocument(missing, FIELDS).success).toBe(false);
    const long = base();
    long.sections[0].text = 'x'.repeat(5001);
    expect(validateDocument(long, FIELDS).success).toBe(false);
  });

  test('comparison.previousBilanIds : entiers positifs, max 10', () => {
    const doc = base();
    doc.comparison = { previousBilanIds: [1, 2] };
    expect(validateDocument(doc, FIELDS).success).toBe(true);
    doc.comparison = { previousBilanIds: [0] };
    expect(validateDocument(doc, FIELDS).success).toBe(false);
  });
});
