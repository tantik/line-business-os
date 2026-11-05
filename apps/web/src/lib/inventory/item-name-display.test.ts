import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectNameLanguage, displayItemName } from './item-name-display.js';

test('detectNameLanguage: kanji, hiragana, katakana, half-width katakana -> ja', () => {
  for (const name of ['牛乳', 'みりん', 'コーヒー豆', 'ｺｰﾋｰ', '々', 'Milk 牛乳']) {
    assert.equal(detectNameLanguage(name), 'ja', name);
  }
});

test('detectNameLanguage: latin, digits, full-width latin -> en (same rule as the 0153 backfill)', () => {
  for (const name of ['Milk', 'Oat milk 1L', 'Ｍｉｌｋ', '123', 'Café crème']) {
    assert.equal(detectNameLanguage(name), 'en', name);
  }
});

test('displayItemName: shows the translation into the UI language when present', () => {
  const translations = { 'item-1': { en: 'Milk' } };
  assert.equal(displayItemName({ itemId: 'item-1', name: '牛乳' }, 'en', translations), 'Milk');
});

test('displayItemName: English translations are sentence-case; originals and Japanese untouched', () => {
  const translations = { a: { en: ' milk ' }, b: { en: 'orange juice' }, c: { en: 'Almond milk' }, d: { ja: 'oat' } };
  assert.equal(displayItemName({ itemId: 'a', name: '牛乳' }, 'en', translations), 'Milk');
  assert.equal(displayItemName({ itemId: 'b', name: 'オレンジジュース' }, 'en', translations), 'Orange juice');
  assert.equal(displayItemName({ itemId: 'c', name: 'アーモンドミルク' }, 'en', translations), 'Almond milk');
  assert.equal(displayItemName({ itemId: 'd', name: 'oat' }, 'ja', translations), 'oat');
  assert.equal(displayItemName({ itemId: 'x', name: 'milk' }, 'en', translations), 'milk', 'original name shown exactly as typed');
});

test('displayItemName: falls back to the original name (other language, missing map, missing item, empty text)', () => {
  const translations = { 'item-1': { en: 'Milk' }, 'item-2': { en: '  ' } };
  assert.equal(displayItemName({ itemId: 'item-1', name: '牛乳' }, 'ja', translations), '牛乳');
  assert.equal(displayItemName({ itemId: 'item-1', name: '牛乳' }, 'en', null), '牛乳');
  assert.equal(displayItemName({ itemId: 'item-1', name: '牛乳' }, 'en', undefined), '牛乳');
  assert.equal(displayItemName({ itemId: 'item-9', name: '氷' }, 'en', translations), '氷');
  assert.equal(displayItemName({ itemId: 'item-2', name: '砂糖' }, 'en', translations), '砂糖');
});
