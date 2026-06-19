const { test } = require('node:test');
const assert = require('node:assert');
const { parseJestResults } = require('./jest');

const SAMPLE = {
  numTotalTests: 3,
  testResults: [
    {
      name: 'C:\\Users\\x\\backend\\tests\\subscription.test.js',
      assertionResults: [
        { title: 'passe si plan actif', status: 'passed', duration: 12, failureMessages: [] },
        { title: 'refuse si FREE', status: 'failed', duration: 8, failureMessages: ['[31mExpected 200 received 403[39m\n  at x'] },
      ],
    },
    {
      name: '/abs/backend/tests/auth.test.js',
      assertionResults: [
        { title: 'skip en CI', status: 'pending', duration: 0, failureMessages: [] },
      ],
    },
  ],
};

test('parseJestResults mappe statut, suite (basename), durée et erreur', () => {
  const out = parseJestResults(SAMPLE);
  assert.deepStrictEqual(out, [
    { suite: 'subscription.test.js', name: 'passe si plan actif', status: 'passed', durationMs: 12, error: null },
    { suite: 'subscription.test.js', name: 'refuse si FREE', status: 'failed', durationMs: 8, error: 'Expected 200 received 403\n  at x' },
    { suite: 'auth.test.js', name: 'skip en CI', status: 'skipped', durationMs: 0, error: null },
  ]);
});

test('parseJestResults tolère un report vide', () => {
  assert.deepStrictEqual(parseJestResults({}), []);
});
