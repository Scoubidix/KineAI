const { test } = require('node:test');
const assert = require('node:assert');
const { parsePlaywrightResults } = require('./playwright');

// Reporter json Playwright : suites imbriquées contenant specs[].tests[].results[].
const SAMPLE = {
  suites: [
    {
      title: 'subscription.spec.ts',
      file: 'tests/subscription.spec.ts',
      specs: [
        {
          title: 'flow complet',
          file: 'tests/subscription.spec.ts',
          tests: [{ status: 'expected', results: [{ status: 'passed', duration: 5000, errors: [] }] }],
        },
      ],
      suites: [
        {
          title: 'groupe',
          file: 'tests/subscription.spec.ts',
          specs: [
            {
              title: 'sous-cas',
              file: 'tests/subscription.spec.ts',
              tests: [{ status: 'unexpected', results: [{ status: 'failed', duration: 100, error: { message: '\x1b[31mboom\x1b[39m' }, errors: [{ message: 'boom' }] }] }],
            },
          ],
          suites: [],
        },
      ],
    },
    {
      title: 'setup',
      file: 'auth.setup.ts',
      specs: [
        {
          title: 'authenticate',
          file: 'auth.setup.ts',
          tests: [{ status: 'skipped', results: [{ status: 'skipped', duration: 0, errors: [] }] }],
        },
      ],
      suites: [],
    },
  ],
};

test('parsePlaywrightResults aplatit les suites imbriquees et mappe les statuts', () => {
  const out = parsePlaywrightResults(SAMPLE);
  assert.deepStrictEqual(out, [
    { suite: 'subscription.spec.ts', name: 'flow complet', status: 'passed', durationMs: 5000, error: null },
    { suite: 'subscription.spec.ts', name: 'sous-cas', status: 'failed', durationMs: 100, error: 'boom' },
    { suite: 'auth.setup.ts', name: 'authenticate', status: 'skipped', durationMs: 0, error: null },
  ]);
});

test('parsePlaywrightResults tolère un report vide', () => {
  assert.deepStrictEqual(parsePlaywrightResults({}), []);
});
