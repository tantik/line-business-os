import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SOURCE = readFileSync(new URL('./preview-inventory-modal.tsx', import.meta.url), 'utf8');

test('Founder QA F11 regression: the scrollable dialog reserves extra bottom clearance for mobile safe-area insets without changing desktop spacing', () => {
  assert.match(SOURCE, /paddingBottom: 'max\(18px, calc\(env\(safe-area-inset-bottom, 0px\) \+ 12px\)\)'/);
});
