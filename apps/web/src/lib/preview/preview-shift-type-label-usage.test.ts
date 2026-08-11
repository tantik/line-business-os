import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Founder QA F05 regression - an auto-generated custom shift type's `code`
 * is an internal `CUSTOM_<timestamp>` identifier (see
 * `upsertWorkforceShiftType` in `lib/workforce/shift-types.ts`), never a
 * customer-facing label. Every Staff/Manager shift-type selector must
 * resolve through the canonical `shiftTypeDisplayLabel()` helper instead of
 * rendering `.code` directly - source-text convention matching
 * `preview-settings-card.test.ts` (no component-rendering harness here).
 */
const LABEL_RENDERING_FILES = [
  'preview-shift-exchange-request-form.tsx',
  'preview-shift-exchange-manager-panel.tsx',
  'preview-shift-preference-form.tsx',
  'preview-shift-editor.tsx',
];

function read(relativeToThisFile: string): string {
  return readFileSync(new URL(relativeToThisFile, import.meta.url), 'utf8');
}

for (const file of LABEL_RENDERING_FILES) {
  test(`${file} imports shiftTypeDisplayLabel from lib/workforce/shift-types`, () => {
    const source = read(file);
    assert.match(
      source,
      /import \{ shiftTypeDisplayLabel, type WorkforceShiftType \} from '@\/lib\/workforce\/shift-types'/,
      `${file} must import shiftTypeDisplayLabel`,
    );
  });

  test(`${file} never renders a shift type's raw .code as a customer-facing label`, () => {
    const source = read(file);
    // Every shift-type loop variable this file has ever used
    // (st/type/requestedType) - none may have `.code` referenced outside the
    // `shiftTypeDisplayLabel(...)` call itself.
    for (const varName of ['st', 'type', 'requestedType']) {
      assert.ok(
        !new RegExp(`\\b${varName}\\.code\\b`).test(source),
        `${file} must not reference ${varName}.code directly - use shiftTypeDisplayLabel(${varName}) instead`,
      );
    }
  });
}
