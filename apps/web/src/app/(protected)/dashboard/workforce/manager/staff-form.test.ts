import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Source-text regression guard: `parseUpsertEmployeeInput`
 * (`employees-input.ts`) requires `familyName`/`givenName`/`email` in the
 * submitted FormData and rejects the whole submission ("Invalid input.") when
 * any are absent, but this form previously submitted only `name` /
 * `positionLabel` / `employmentType` -- so the canonical Manager "Add staff" /
 * "Save changes" action always failed, for every tenant, on every attempt.
 * Discovered while creating the ORUWA Cafe reference tenant's first employee.
 */
const SOURCE = readFileSync(new URL('./staff-form.tsx', import.meta.url), 'utf8');

test('StaffForm submits the family name, given name, and email fields required by parseUpsertEmployeeInput', () => {
  for (const name of ['familyName', 'givenName', 'email']) {
    assert.ok(
      new RegExp(`name="${name}"`).test(SOURCE),
      `StaffForm must include an input with name="${name}"`,
    );
  }
});
