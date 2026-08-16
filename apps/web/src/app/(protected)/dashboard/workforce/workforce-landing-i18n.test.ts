import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tWorkforceLanding } from './workforce-landing-i18n.js';

/**
 * Same convention as `staff-dashboard-i18n.test.ts` / `manager-dashboard-i18n.test.ts`:
 * pure-function behavioral tests of the translator (no DOM/React harness in
 * this repo's test runner), proving the Workforce landing page's newly
 * added JA/EN dictionary actually has distinct, non-empty copy for every
 * key in both languages -- not just that a toggle exists.
 */
const LANGS = ['ja', 'en'] as const;

const ALL_KEYS: Parameters<typeof tWorkforceLanding>[1][] = [
  'myProfileHeading', 'position', 'employmentType', 'status', 'statusActive', 'statusInactive',
  'notSet', 'noProfile', 'profileUnavailable',
  'staffHeading', 'staffDescription', 'openStaffDashboard',
  'managerHeading', 'managerDescription', 'openManagerDashboard',
  'recipesHeading', 'recipesDescription', 'viewRecipes',
];

test('tWorkforceLanding returns a non-empty string for every key in both languages', () => {
  for (const lang of LANGS) {
    for (const key of ALL_KEYS) {
      const value = tWorkforceLanding(lang, key);
      assert.equal(typeof value, 'string', `tWorkforceLanding(${lang}, ${key}) must return a string`);
      assert.ok(value.length > 0, `tWorkforceLanding(${lang}, ${key}) must not be empty`);
    }
  }
});

test('tWorkforceLanding ja/en copy differs for every key (no untranslated English leaking through when JA is selected)', () => {
  for (const key of ALL_KEYS) {
    assert.notEqual(
      tWorkforceLanding('ja', key),
      tWorkforceLanding('en', key),
      `tWorkforceLanding(ja/en, ${key}) should have distinct copy`,
    );
  }
});
