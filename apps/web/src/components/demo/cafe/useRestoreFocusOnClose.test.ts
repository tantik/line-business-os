import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * FA-05 regression - `useRestoreFocusOnClose` is the single implementation
 * shared by every dialog in this app (`Modal`, `ConfirmDialog`); before this
 * fix, Escape (and every other close path) left `document.activeElement` at
 * `BODY` instead of returning it to the control that opened the dialog.
 * Source-text checks (no DOM/component-rendering harness in this repo's
 * `node:test` runner - see `authorize.test.ts` for the same convention) for
 * the exact capture/restore/fail-safe properties a rendering test would
 * otherwise assert.
 */
const SOURCE = readFileSync(new URL('./useRestoreFocusOnClose.ts', import.meta.url), 'utf8');
const MODAL_SOURCE = readFileSync(new URL('./Modal.tsx', import.meta.url), 'utf8');
const CONFIRM_DIALOG_SOURCE = readFileSync(new URL('./ConfirmDialog.tsx', import.meta.url), 'utf8');

test('captures document.activeElement when the dialog opens', () => {
  assert.ok(/if \(open\) \{/.test(SOURCE));
  assert.ok(/openerRef\.current = document\.activeElement instanceof HTMLElement \? document\.activeElement : null/.test(SOURCE));
});

test('restores focus to the captured opener when the dialog closes', () => {
  assert.ok(/opener\.focus\(\)/.test(SOURCE));
});

test('never attempts to focus an opener that has been removed from the DOM', () => {
  assert.ok(/if \(!opener \|\| !opener\.isConnected\) return;/.test(SOURCE));
});

test('never attempts to focus an opener that has since become disabled', () => {
  assert.ok(/if \('disabled' in opener && \(opener as HTMLButtonElement\)\.disabled\) return;/.test(SOURCE));
});

test('the effect is keyed only on the open prop, so every close path (Escape, backdrop, Cancel, close button) is covered identically', () => {
  assert.ok(/\}, \[open\]\);/.test(SOURCE));
});

test('the captured opener ref is cleared before restoring, so a stale reference is never reused across open/close cycles', () => {
  const closeIdx = SOURCE.indexOf('const opener = openerRef.current;');
  const clearIdx = SOURCE.indexOf('openerRef.current = null;', closeIdx);
  const focusIdx = SOURCE.indexOf('opener.focus()', closeIdx);
  assert.ok(closeIdx >= 0 && clearIdx >= 0 && focusIdx >= 0);
  assert.ok(clearIdx < focusIdx, 'the ref must be cleared before the (possibly skipped) focus() call, not after');
});

test('Modal uses the shared focus-restore hook rather than a bespoke implementation', () => {
  assert.ok(/import \{ useRestoreFocusOnClose \} from '\.\/useRestoreFocusOnClose'/.test(MODAL_SOURCE));
  assert.ok(/useRestoreFocusOnClose\(open\);/.test(MODAL_SOURCE));
});

test('ConfirmDialog uses the shared focus-restore hook rather than a bespoke implementation', () => {
  assert.ok(/import \{ useRestoreFocusOnClose \} from '\.\/useRestoreFocusOnClose'/.test(CONFIRM_DIALOG_SOURCE));
  assert.ok(/useRestoreFocusOnClose\(open\);/.test(CONFIRM_DIALOG_SOURCE));
});
