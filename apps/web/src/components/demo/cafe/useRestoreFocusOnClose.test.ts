import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * `Modal`/`ConfirmDialog`/`useRestoreFocusOnClose` were promoted to
 * `@/components/shared/design-kit` (Cafe manager-parity design-kit work) so
 * any module/package can reuse them, not just this Cafe demo package. The
 * files at this path are now thin, prop-compatible re-export shims, kept so
 * every existing call site under `apps/web/src/lib/preview/**` and
 * `apps/web/src/components/demo/cafe/**` keeps working unchanged. The full
 * focus-restore behavior regression suite now lives at
 * `@/components/shared/design-kit/useRestoreFocusOnClose.test.ts` (the
 * canonical implementation); this file only guards the shim itself.
 */
const HOOK_SHIM_SOURCE = readFileSync(new URL('./useRestoreFocusOnClose.ts', import.meta.url), 'utf8');
const MODAL_SHIM_SOURCE = readFileSync(new URL('./Modal.tsx', import.meta.url), 'utf8');
const CONFIRM_DIALOG_SHIM_SOURCE = readFileSync(new URL('./ConfirmDialog.tsx', import.meta.url), 'utf8');

test('useRestoreFocusOnClose re-exports the shared design-kit implementation, not a bespoke copy', () => {
  assert.ok(/export \{ useRestoreFocusOnClose \} from '@\/components\/shared\/design-kit'/.test(HOOK_SHIM_SOURCE));
});

test('Modal wraps the shared design-kit Modal, not a bespoke implementation', () => {
  assert.ok(/import \{ Modal as SharedModal \} from '@\/components\/shared\/design-kit'/.test(MODAL_SHIM_SOURCE));
  assert.ok(/<SharedModal/.test(MODAL_SHIM_SOURCE));
});

test('Modal shim stays prop-compatible with every existing call site (maxWidth in px) and still resolves the JA/EN close label from this package\'s own useLang()', () => {
  assert.ok(/maxWidth\?: number/.test(MODAL_SHIM_SOURCE));
  assert.ok(/useLang\(\)/.test(MODAL_SHIM_SOURCE));
  assert.ok(/width=\{`\$\{maxWidth\}px`\}/.test(MODAL_SHIM_SOURCE));
  assert.ok(/closeLabel=\{lang === 'ja' \? '閉じる' : 'Close'\}/.test(MODAL_SHIM_SOURCE));
});

test('ConfirmDialog re-exports the shared design-kit implementation, not a bespoke copy', () => {
  assert.ok(/export \{ ConfirmDialog \} from '@\/components\/shared\/design-kit'/.test(CONFIRM_DIALOG_SHIM_SOURCE));
});
