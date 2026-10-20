import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CAFE_PACKAGE_MODULES,
  CAFE_PACKAGE_TEMPLATE,
  CAFE_PACKAGE_TEMPLATE_VERSION,
  validateCafePackageTemplate,
  type CafePackageTemplate,
} from './cafe-package-template.js';

function clone(): CafePackageTemplate {
  return structuredClone(CAFE_PACKAGE_TEMPLATE);
}

test('Cafe v3 template is valid and lists the modules of DB package cafe (0129/0131/0132 order)', () => {
  assert.equal(validateCafePackageTemplate(CAFE_PACKAGE_TEMPLATE).ok, true);
  assert.equal(CAFE_PACKAGE_TEMPLATE.version, 3);
  assert.equal(CAFE_PACKAGE_TEMPLATE.packageCode, 'cafe');
  assert.deepEqual(
    [...CAFE_PACKAGE_TEMPLATE.requiredModules],
    ['core', 'recipes', 'inventory', 'workforce', 'purchases', 'operations', 'issues'],
  );
});

test('Cafe v3 template carries the provisioning defaults (trial 30 d, schedule, three shift types)', () => {
  assert.deepEqual(CAFE_PACKAGE_TEMPLATE.plan, { code: 'trial', trialDays: 30 });
  assert.deepEqual([...CAFE_PACKAGE_TEMPLATE.scheduleDefaults.requiredHeadcountByWeekday], [1, 2, 2, 2, 2, 2, 1]);
  assert.equal(CAFE_PACKAGE_TEMPLATE.scheduleDefaults.maxMonthlyHours, 160);
  assert.equal(CAFE_PACKAGE_TEMPLATE.scheduleDefaults.maxWeeklyHours, 40);
  assert.equal(CAFE_PACKAGE_TEMPLATE.scheduleDefaults.maxDaysPerWeek, 5);
  assert.equal(CAFE_PACKAGE_TEMPLATE.scheduleDefaults.autoCreateEnabled, false);
  assert.deepEqual(
    CAFE_PACKAGE_TEMPLATE.shiftTypes.map((t) => `${t.labelJa} ${t.startsAtLocal}-${t.endsAtLocal}`),
    ['早番 07:00-12:00', '中番 10:00-14:00', '遅番 12:00-17:00'],
  );
});

test('Cafe template has a stable version and no secret/customer identity fields', () => {
  assert.equal(CAFE_PACKAGE_TEMPLATE.version, CAFE_PACKAGE_TEMPLATE_VERSION);
  assert.doesNotMatch(JSON.stringify(CAFE_PACKAGE_TEMPLATE), /password|secret|token|email|api.?key/i);
});

test('template validation rejects any missing package module', () => {
  for (const missing of CAFE_PACKAGE_MODULES) {
    const bad = clone();
    bad.requiredModules = CAFE_PACKAGE_TEMPLATE.requiredModules.filter((m) => m !== missing);
    const result = validateCafePackageTemplate(bad);
    assert.equal(result.ok, false);
    assert.ok(!result.ok && result.errors.includes(`Required module "${missing}" is missing.`));
  }
});

test('template validation rejects an old template version', () => {
  const bad = clone() as unknown as { version: number };
  bad.version = 2;
  assert.equal(validateCafePackageTemplate(bad as unknown as CafePackageTemplate).ok, false);
});

test('template validation rejects auto-create switched on at provisioning', () => {
  const bad = clone() as unknown as { scheduleDefaults: { autoCreateEnabled: boolean } };
  bad.scheduleDefaults.autoCreateEnabled = true;
  assert.equal(validateCafePackageTemplate(bad as unknown as CafePackageTemplate).ok, false);
});

test('template validation rejects duplicate or inverted shift types', () => {
  const dup = clone();
  dup.shiftTypes = [CAFE_PACKAGE_TEMPLATE.shiftTypes[0]!, CAFE_PACKAGE_TEMPLATE.shiftTypes[0]!];
  assert.equal(validateCafePackageTemplate(dup).ok, false);
  const inverted = clone();
  inverted.shiftTypes = [{ ...CAFE_PACKAGE_TEMPLATE.shiftTypes[0]!, startsAtLocal: '12:00', endsAtLocal: '07:00' }];
  assert.equal(validateCafePackageTemplate(inverted).ok, false);
});

test('template validation rejects an unready minimum-data contract', () => {
  const bad = clone();
  bad.minimumReadyData.activeInventoryItems = 0;
  assert.equal(validateCafePackageTemplate(bad).ok, false);
});

test('template validation rejects duplicate checklist entries', () => {
  const bad = clone();
  bad.operatorChecklist = ['same', 'same'];
  assert.equal(validateCafePackageTemplate(bad).ok, false);
});
