import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CAFE_PACKAGE_TEMPLATE_VERSION,
  CAFE_PACKAGE_V2_TEMPLATE,
  validateCafePackageTemplate,
  type CafePackageTemplate,
} from './cafe-package-template.js';

function clone(): CafePackageTemplate {
  return structuredClone(CAFE_PACKAGE_V2_TEMPLATE);
}

test('Cafe v2 template is valid and enables the required modules', () => {
  assert.equal(validateCafePackageTemplate(CAFE_PACKAGE_V2_TEMPLATE).ok, true);
  assert.deepEqual(CAFE_PACKAGE_V2_TEMPLATE.requiredModules, ['core', 'workforce', 'inventory']);
});

test('Cafe v2 template has a stable version and no secret/customer identity fields', () => {
  assert.equal(CAFE_PACKAGE_V2_TEMPLATE.version, CAFE_PACKAGE_TEMPLATE_VERSION);
  assert.doesNotMatch(JSON.stringify(CAFE_PACKAGE_V2_TEMPLATE), /password|secret|token|email|api.?key/i);
});

test('template validation rejects a missing Inventory module', () => {
  const bad = clone();
  bad.requiredModules = ['core', 'workforce'];
  assert.equal(validateCafePackageTemplate(bad).ok, false);
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
