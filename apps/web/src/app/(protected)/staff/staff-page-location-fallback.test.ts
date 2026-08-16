import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Source-text regression guard for LOC-1
 * (`docs/ai/ORUWA_CAFE_V2_1_WHOLE_PRODUCT_INTEGRITY_GATE.md`): the canonical
 * Staff page previously fell back to a different active location, or even
 * `tenantLocations[0]` unconditionally, when the employee's own assigned
 * location was missing or inactive -- unlike the
 * `_client-preview/mame-to-cha` reference surface, which fails closed. Same
 * as every other fail-closed regression guard in this codebase, this is a
 * source-text check (no DOM/Supabase mocking harness here), not a
 * behavioral test.
 */
const SOURCE = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');

test('LOC-1: Staff location resolution requires the employee\'s own assigned, active location -- never substitutes another one', () => {
  assert.ok(
    /const location = tenantLocations\.find\(\(l\) => l\.locationId === profile\.locationId && l\.isActive\);/.test(
      SOURCE,
    ),
    'must resolve location strictly from profile.locationId + isActive, not a fallback chain',
  );
  assert.ok(
    !SOURCE.includes("tenantLocations.find((l) => l.isActive) ?? tenantLocations[0]"),
    'the old lenient fallback (any active location, else literally any location) must not reappear',
  );
});
