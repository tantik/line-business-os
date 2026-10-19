import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_VOCABULARY, PACKAGE_VOCABULARY, resolveVocabulary, vocabularyWord } from './vocabulary.js';

test('Cafe (and no package) resolve to the default words', () => {
  assert.deepEqual(resolveVocabulary(['cafe']), DEFAULT_VOCABULARY);
  assert.deepEqual(resolveVocabulary([]), DEFAULT_VOCABULARY);
  assert.equal(vocabularyWord(resolveVocabulary(['cafe']), 'ja', 'module.operations'), 'オペレーション');
});

test('a package override replaces only its own words, per language', () => {
  const overrides = { cleaning: { ja: { 'module.operations': '清掃報告' }, en: { 'module.operations': 'Cleaning reports' } } };
  const vocabulary = resolveVocabulary(['cleaning'], overrides);
  assert.equal(vocabularyWord(vocabulary, 'ja', 'module.operations'), '清掃報告');
  assert.equal(vocabularyWord(vocabulary, 'en', 'module.operations'), 'Cleaning reports');
  assert.equal(vocabularyWord(vocabulary, 'ja', 'module.recipes'), 'レシピ');
});

test('with several packages the first one (package order) wins', () => {
  const overrides = {
    a: { ja: { 'module.issues': 'A の言葉' } },
    b: { ja: { 'module.issues': 'B の言葉', 'module.recipes': 'B のレシピ' } },
  };
  const vocabulary = resolveVocabulary(['a', 'b'], overrides);
  assert.equal(vocabularyWord(vocabulary, 'ja', 'module.issues'), 'A の言葉');
  assert.equal(vocabularyWord(vocabulary, 'ja', 'module.recipes'), 'B のレシピ');
});

test('resolving never mutates the default words', () => {
  resolveVocabulary(['x'], { x: { ja: { 'module.inventory': '変更' } } });
  assert.equal(DEFAULT_VOCABULARY.ja['module.inventory'], '在庫');
});

test('every default word is non-empty and differs between JA and EN', () => {
  for (const key of Object.keys(DEFAULT_VOCABULARY.ja) as (keyof typeof DEFAULT_VOCABULARY.ja)[]) {
    assert.ok(DEFAULT_VOCABULARY.ja[key] && DEFAULT_VOCABULARY.en[key], key);
    assert.notEqual(DEFAULT_VOCABULARY.ja[key], DEFAULT_VOCABULARY.en[key], key);
  }
});

test('every package override only uses known keys', () => {
  const known = new Set(Object.keys(DEFAULT_VOCABULARY.ja));
  for (const [code, override] of Object.entries(PACKAGE_VOCABULARY)) {
    for (const words of Object.values(override)) {
      for (const key of Object.keys(words ?? {})) assert.ok(known.has(key), `${code}: unknown key ${key}`);
    }
  }
});
