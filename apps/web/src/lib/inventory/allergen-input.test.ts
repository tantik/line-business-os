import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideAllergenWrite } from './allergen-input.js';

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

test('confirmed with codes -> set those codes', () => {
  assert.deepEqual(
    decideAllergenWrite(form({ allergensConfirmed: 'true', allergenCodesJson: '["egg","pistachio"]' })),
    { kind: 'set', codes: ['egg', 'pistachio'] },
  );
});

test('confirmed with none ticked -> set [] (store confirmed none)', () => {
  assert.deepEqual(decideAllergenWrite(form({ allergensConfirmed: 'true', allergenCodesJson: '[]' })), { kind: 'set', codes: [] });
  assert.deepEqual(decideAllergenWrite(form({ allergensConfirmed: 'true' })), { kind: 'set', codes: [] });
});

test('loaded as confirmed, now unchecked -> set NULL (confirmation revoked)', () => {
  assert.deepEqual(
    decideAllergenWrite(form({ allergensConfirmed: 'false', allergensInitiallyConfirmed: 'true', allergenCodesJson: '[]' })),
    { kind: 'set', codes: null },
  );
});

test('never confirmed and left unchecked -> skip (NULL stays NULL, nothing sent)', () => {
  assert.deepEqual(decideAllergenWrite(form({ allergensConfirmed: 'false', allergensInitiallyConfirmed: 'false' })), { kind: 'skip' });
  assert.deepEqual(decideAllergenWrite(form({})), { kind: 'skip' });
});

test('confirmed but malformed codes JSON -> invalid', () => {
  assert.deepEqual(decideAllergenWrite(form({ allergensConfirmed: 'true', allergenCodesJson: 'not json' })), { kind: 'invalid' });
  assert.deepEqual(decideAllergenWrite(form({ allergensConfirmed: 'true', allergenCodesJson: '[1,2]' })), { kind: 'invalid' });
  assert.deepEqual(decideAllergenWrite(form({ allergensConfirmed: 'true', allergenCodesJson: '{"a":1}' })), { kind: 'invalid' });
});
