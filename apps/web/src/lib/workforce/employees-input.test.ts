import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseBindEmployeeLineUserInput,
  parseSetEmployeeActiveInput,
  parseUnbindEmployeeLineUserInput,
  parseUpsertEmployeeInput,
} from './employees-input.js';

const LOCATION_ID = '11111111-1111-1111-1111-111111111111';
const STAFF_ID = '22222222-2222-2222-2222-222222222222';
const BASE_FIELDS_EARLY = { locationId: LOCATION_ID, name: 'Aiko Tanaka', familyName: 'Tanaka', givenName: 'Aiko', email: 'aiko@example.com' };

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

test('parseUpsertEmployeeInput: create (no id) with required fields only', () => {
  const result = parseUpsertEmployeeInput(formData({
    locationId: LOCATION_ID,
    name: 'Aiko Tanaka',
    familyName: 'Tanaka',
    givenName: 'Aiko',
    email: 'AIKO@EXAMPLE.COM',
  }));
  assert.deepEqual(result, {
    id: null,
    locationId: LOCATION_ID,
    name: 'Aiko Tanaka',
    familyName: 'Tanaka',
    givenName: 'Aiko',
    email: 'aiko@example.com',
    notes: undefined,
    positionLabel: undefined,
    employmentType: undefined,
    isActive: undefined,
    hourlyWageYen: undefined,
  });
});

test('parseUpsertEmployeeInput: position and employment type are tri-state too (absent leaves stored value, blank clears)', () => {
  const absent = parseUpsertEmployeeInput(formData({ ...BASE_FIELDS_EARLY }))!;
  assert.equal(absent.positionLabel, undefined);
  assert.equal(absent.employmentType, undefined);
  const blank = parseUpsertEmployeeInput(formData({ ...BASE_FIELDS_EARLY, positionLabel: '', employmentType: '' }))!;
  assert.equal(blank.positionLabel, null);
  assert.equal(blank.employmentType, null);
});

test('parseUpsertEmployeeInput: edit (with id) and all optional fields', () => {
  const fd = formData({
    id: STAFF_ID,
    locationId: LOCATION_ID,
    name: 'Kenji Sato',
    familyName: 'Sato',
    givenName: 'Kenji',
    email: 'kenji@example.com',
    notes: 'Weekends preferred',
    positionLabel: 'Barista',
    employmentType: 'part_time',
  });
  fd.set('isActive', 'true');
  const result = parseUpsertEmployeeInput(fd);
  assert.deepEqual(result, {
    id: STAFF_ID,
    locationId: LOCATION_ID,
    name: 'Kenji Sato',
    familyName: 'Sato',
    givenName: 'Kenji',
    email: 'kenji@example.com',
    notes: 'Weekends preferred',
    positionLabel: 'Barista',
    employmentType: 'part_time',
    isActive: true,
    hourlyWageYen: undefined,
  });
});

const BASE_FIELDS = { locationId: LOCATION_ID, name: 'Aiko Tanaka', familyName: 'Tanaka', givenName: 'Aiko', email: 'aiko@example.com' };

test('parseUpsertEmployeeInput: hourly wage is tri-state -- absent = leave unchanged, blank = clear, number = set', () => {
  assert.equal(parseUpsertEmployeeInput(formData({ ...BASE_FIELDS }))!.hourlyWageYen, undefined);
  assert.equal(parseUpsertEmployeeInput(formData({ ...BASE_FIELDS, hourlyWageYen: '' }))!.hourlyWageYen, null);
  assert.equal(parseUpsertEmployeeInput(formData({ ...BASE_FIELDS, hourlyWageYen: '   ' }))!.hourlyWageYen, null);
  assert.equal(parseUpsertEmployeeInput(formData({ ...BASE_FIELDS, hourlyWageYen: '1200' }))!.hourlyWageYen, 1200);
  assert.equal(parseUpsertEmployeeInput(formData({ ...BASE_FIELDS, hourlyWageYen: ' 1350 ' }))!.hourlyWageYen, 1350);
});

test('parseUpsertEmployeeInput: hourly wage 0 and the 1,000,000 ceiling are valid; negatives, decimals, text and > 1,000,000 are rejected', () => {
  assert.equal(parseUpsertEmployeeInput(formData({ ...BASE_FIELDS, hourlyWageYen: '0' }))!.hourlyWageYen, 0);
  assert.equal(parseUpsertEmployeeInput(formData({ ...BASE_FIELDS, hourlyWageYen: '1000000' }))!.hourlyWageYen, 1_000_000);
  for (const bad of ['-1', '1000001', '12.5', '1e3x', '1e3', '0x10', '+5', 'abc', 'NaN', '99999999']) {
    assert.equal(parseUpsertEmployeeInput(formData({ ...BASE_FIELDS, hourlyWageYen: bad })), null, `hourlyWageYen "${bad}" must be rejected`);
  }
});

test('parseUpsertEmployeeInput: notes are tri-state too -- an edit that does not send notes must not clear them (DEBT-052)', () => {
  assert.equal(parseUpsertEmployeeInput(formData({ ...BASE_FIELDS }))!.notes, undefined);
  assert.equal(parseUpsertEmployeeInput(formData({ ...BASE_FIELDS, notes: '' }))!.notes, null);
  assert.equal(parseUpsertEmployeeInput(formData({ ...BASE_FIELDS, notes: 'Weekends only' }))!.notes, 'Weekends only');
});

test('parseUpsertEmployeeInput rejects missing name/locationId and a malformed non-blank id', () => {
  assert.equal(parseUpsertEmployeeInput(formData({ locationId: LOCATION_ID })), null);
  assert.equal(parseUpsertEmployeeInput(formData({ name: 'Aiko' })), null);
  assert.equal(parseUpsertEmployeeInput(formData({ id: 'not-a-uuid', locationId: LOCATION_ID, name: 'Aiko' })), null);
});

test('parseUpsertEmployeeInput rejects missing required contact fields or malformed email', () => {
  const base = { locationId: LOCATION_ID, name: 'Aiko', familyName: 'Tanaka', givenName: 'Aiko' };
  assert.equal(parseUpsertEmployeeInput(formData(base)), null);
  assert.equal(parseUpsertEmployeeInput(formData({ ...base, email: 'not-an-email' })), null);
});

test('parseSetEmployeeActiveInput parses staffId + isActive', () => {
  const fd = formData({ staffId: STAFF_ID });
  fd.set('isActive', 'true');
  assert.deepEqual(parseSetEmployeeActiveInput(fd), { staffId: STAFF_ID, isActive: true });

  const fdOff = formData({ staffId: STAFF_ID });
  assert.deepEqual(parseSetEmployeeActiveInput(fdOff), { staffId: STAFF_ID, isActive: false });
});
test('parseSetEmployeeActiveInput rejects a missing/malformed staffId', () => {
  assert.equal(parseSetEmployeeActiveInput(formData({})), null);
});

test('parseBindEmployeeLineUserInput parses employeeId + rawLineUserId', () => {
  assert.deepEqual(parseBindEmployeeLineUserInput(formData({ employeeId: STAFF_ID, rawLineUserId: 'U1234567890abcdef' })), {
    employeeId: STAFF_ID,
    rawLineUserId: 'U1234567890abcdef',
  });
});
test('parseBindEmployeeLineUserInput rejects a missing/blank rawLineUserId or malformed employeeId', () => {
  assert.equal(parseBindEmployeeLineUserInput(formData({ employeeId: STAFF_ID })), null);
  assert.equal(parseBindEmployeeLineUserInput(formData({ employeeId: STAFF_ID, rawLineUserId: '   ' })), null);
  assert.equal(parseBindEmployeeLineUserInput(formData({ employeeId: 'bad', rawLineUserId: 'U123' })), null);
});

test('parseUnbindEmployeeLineUserInput parses employeeId', () => {
  assert.deepEqual(parseUnbindEmployeeLineUserInput(formData({ employeeId: STAFF_ID })), { employeeId: STAFF_ID });
});
test('parseUnbindEmployeeLineUserInput rejects a missing employeeId', () => {
  assert.equal(parseUnbindEmployeeLineUserInput(formData({})), null);
});
