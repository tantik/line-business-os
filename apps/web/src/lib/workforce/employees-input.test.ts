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
    notes: null,
    positionLabel: null,
    employmentType: null,
    isActive: undefined,
    hourlyWageYen: null,
  });
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
    hourlyWageYen: null,
  });
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
