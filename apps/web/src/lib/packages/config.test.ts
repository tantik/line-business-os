import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PACKAGE_CONFIG, PACKAGE_CONFIG, resolvePackageConfig } from './config.js';

test('cafe: allergens on, cafe translation hint', () => {
  const config = resolvePackageConfig(['cafe']);
  assert.equal(config.allergens, true);
  assert.equal(
    config.translationDomainHint,
    'You translate short Japanese food/beverage-recipe text fields into clear, natural English for a cafe staff app.',
  );
});

test('empty package list (read failure / no package) falls back to the cafe config, not the neutral default', () => {
  assert.deepEqual(resolvePackageConfig([]), resolvePackageConfig(['cafe']));
  assert.equal(resolvePackageConfig([]).allergens, true);
});

test('an unknown package code resolves to the neutral default', () => {
  assert.deepEqual(resolvePackageConfig(['cleaning']), DEFAULT_PACKAGE_CONFIG);
  assert.equal(resolvePackageConfig(['cleaning']).allergens, false);
});

test('the neutral default has no food/cafe wording', () => {
  assert.equal(DEFAULT_PACKAGE_CONFIG.allergens, false);
  assert.doesNotMatch(DEFAULT_PACKAGE_CONFIG.translationDomainHint, /cafe|food|beverage|recipe|kitchen/i);
});

test('several packages: the first one (package order) defining a field wins; default fills the rest', () => {
  const overrides = {
    a: { translationDomainHint: 'A hint' },
    b: { allergens: true, translationDomainHint: 'B hint' },
  };
  assert.deepEqual(resolvePackageConfig(['a', 'b'], overrides), { allergens: true, translationDomainHint: 'A hint' });
  assert.deepEqual(resolvePackageConfig(['b', 'a'], overrides), { allergens: true, translationDomainHint: 'B hint' });
  assert.deepEqual(resolvePackageConfig(['a'], overrides), {
    allergens: false,
    translationDomainHint: 'A hint',
  });
});

test('an unknown code next to cafe does not hide cafe settings', () => {
  assert.deepEqual(resolvePackageConfig(['unknown', 'cafe']), resolvePackageConfig(['cafe']));
});

test('resolving never mutates the defaults or the package table', () => {
  const before = JSON.stringify({ DEFAULT_PACKAGE_CONFIG, PACKAGE_CONFIG });
  const config = resolvePackageConfig(['cafe']);
  config.allergens = false;
  assert.equal(JSON.stringify({ DEFAULT_PACKAGE_CONFIG, PACKAGE_CONFIG }), before);
});
