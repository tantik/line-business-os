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

/**
 * Cafe v2.1 final closure mission (F1): this modal was previously entirely
 * hardcoded English, ignoring the Manager JA/EN toggle already proven on the
 * surrounding page. Source-text regression guard, same convention as the
 * test above -- this repo's test runner has no DOM/React harness.
 */
test('StaffForm uses the existing Manager useLang/tManagerDashboard mechanism, not a new i18n system', () => {
  assert.match(SOURCE, /import\s*\{\s*useLang\s*\}\s*from\s*'@\/lib\/demo\/cafe\/i18n'/);
  assert.match(SOURCE, /import\s*\{\s*tManagerDashboard\s*\}\s*from\s*'\.\/manager-dashboard-i18n'/);
  assert.doesNotMatch(SOURCE, /LangProvider/, 'StaffForm must not introduce its own LangProvider');
});

// 2026-08-21 polish pass: "Employment type" is temporarily removed from the
// visible form (Founder direction) -- it survives only as a hidden input so
// an edit-and-save never silently wipes an existing value, so
// 'fieldEmploymentType' is deliberately not rendered via t(...) here
// anymore. Save/Cancel also moved out of this form into the parent popup's
// own bottom action bar (see staff-form.tsx's module doc comment).
test('StaffForm renders every system/chrome label through t(...), not a hardcoded English literal', () => {
  for (const key of ['fieldName', 'fieldFamilyName', 'fieldGivenName', 'fieldEmail', 'fieldPosition']) {
    assert.ok(new RegExp(`t\\('${key}'\\)`).test(SOURCE), `StaffForm must render the '${key}' key via t(...)`);
  }
  for (const hardcoded of ['>Name<', '>Email<', '>Cancel<', '>Save changes<', '>Add staff<', "'Saving...'"]) {
    assert.ok(!SOURCE.includes(hardcoded), `StaffForm must not contain the hardcoded English literal ${hardcoded}`);
  }
});

test('StaffForm keeps user-entered business fields bound directly to the employee record, never translated', () => {
  for (const [field, prop] of [
    ['name', 'employee?.name'],
    ['familyName', 'employee?.familyName'],
    ['givenName', 'employee?.givenName'],
    ['email', 'employee?.email'],
    ['positionLabel', 'employee?.positionLabel'],
    ['employmentType', 'employee?.employmentType'],
  ] as const) {
    assert.ok(
      SOURCE.includes(`name="${field}" defaultValue={${prop}`),
      `StaffForm's "${field}" input must default from the untranslated ${prop}`,
    );
  }
});
