import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SOURCE = readFileSync(new URL('./settings-actions.ts', import.meta.url), 'utf8');

test('exports exactly the manager schedule-settings action', () => {
  assert.deepEqual(
    [...SOURCE.matchAll(/export async function (preview[A-Za-z]+)\(/g)].map((match) => match[1]),
    ['previewSaveScheduleSettings'],
  );
});

test('validates all seven weekday values and monthly hours before resolving manager context', () => {
  const validationIndex = SOURCE.indexOf('required.length !== 7');
  const contextIndex = SOURCE.indexOf("resolvePreviewManagerContext('workforce.shift.write')");
  assert.ok(validationIndex >= 0 && validationIndex < contextIndex);
  assert.ok(SOURCE.includes('(item as number) > 100'));
  assert.ok(SOURCE.includes('(maxHours as number) > 744'));
});

test('uses shift.write and only server-resolved tenant and location authority', () => {
  assert.ok(SOURCE.includes("resolvePreviewManagerContext('workforce.shift.write')"));
  assert.ok(SOURCE.includes('const { supabase, tenantId, locationId } = contextResult.context'));
  assert.ok(!SOURCE.includes("formData.get('tenantId')"));
  assert.ok(!SOURCE.includes("formData.get('locationId')"));
  assert.ok(!/service_role|createServiceClient/i.test(SOURCE));
});
