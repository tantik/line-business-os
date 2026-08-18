import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * `ConfirmDialog` was promoted to `@/components/shared/design-kit` (Cafe
 * manager-parity design-kit work) so any module/package can reuse it, not
 * just this Cafe demo package. This file is now a thin re-export shim; the
 * full focus-restore/z-index regression suite lives at
 * `@/components/shared/design-kit/ConfirmDialog.test.ts` (the canonical
 * implementation). This test only guards the shim itself.
 */
const SHIM_SOURCE = readFileSync(new URL('./ConfirmDialog.tsx', import.meta.url), 'utf8');

test('ConfirmDialog re-exports the shared design-kit implementation, not a bespoke copy', () => {
  assert.ok(/export \{ ConfirmDialog \} from '@\/components\/shared\/design-kit'/.test(SHIM_SOURCE));
});
