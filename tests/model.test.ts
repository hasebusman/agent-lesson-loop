import assert from 'node:assert/strict';
import test from 'node:test';
import { safeText } from '../src/model.ts';

test('synthetic token families are rejected across varied lengths and surrounding text', () => {
  const prefixes = ['sk-', 'ghp_', 'gho_', 'ghu_', 'ghs_', 'ghr_', 'github_pat_', 'AKIA'];
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let state = 0x5eed;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
  for (const prefix of prefixes) {
    for (let trial = 0; trial < 25; trial++) {
      const suffix = Array.from({ length: 12 + next() % 45 }, () => alphabet[next() % alphabet.length]).join('');
      assert.throws(() => safeText(`Remember ${prefix}${suffix} for this task`, 'lesson'), /private data/);
    }
  }
  assert.equal(safeText('Inspect the existing login screen before changing auth.', 'lesson'),
    'Inspect the existing login screen before changing auth.');
});
