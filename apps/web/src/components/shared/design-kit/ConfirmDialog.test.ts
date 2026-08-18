import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Source-text regression guard for `ConfirmDialog`'s focus restoration
 * (FR-03) -- same convention as `attendance-actions.test.ts`, needed because
 * this repo's test runner (`node --test`) has no DOM/React-rendering
 * environment available to exercise the effect directly.
 *
 * Canonical location: promoted here from `components/demo/cafe/**` (Cafe
 * manager-parity design-kit work) so any module/package can reuse it, not
 * just Cafe. `components/demo/cafe/ConfirmDialog.test.ts` now only checks
 * that package's re-export shim.
 */
const SOURCE = readFileSync(new URL('./ConfirmDialog.tsx', import.meta.url), 'utf8');
const MODAL_SOURCE = readFileSync(new URL('./Modal.tsx', import.meta.url), 'utf8');

test('confirmation overlay stays above the shared parent modal', () => {
  const confirmZIndex = Number(SOURCE.match(/zIndex:\s*(\d+)/)?.[1]);
  const modalZIndex = Number(MODAL_SOURCE.match(/zIndex:\s*(\d+)/)?.[1]);

  assert.ok(Number.isFinite(confirmZIndex), 'ConfirmDialog must define a numeric overlay z-index');
  assert.ok(Number.isFinite(modalZIndex), 'Modal must define a numeric overlay z-index');
  assert.ok(
    confirmZIndex > modalZIndex,
    `ConfirmDialog z-index (${confirmZIndex}) must exceed Modal z-index (${modalZIndex}) so nested confirmations receive pointer input`,
  );
});

test('captures the previously-focused element while open and restores it on close', () => {
  assert.ok(
    /const previouslyFocused = document\.activeElement/.test(SOURCE),
    'must capture document.activeElement when the dialog opens (Cancel/Escape/backdrop all close through the same open->false transition)',
  );
});

test('guards the restore with document.contains so a since-removed opener never throws', () => {
  assert.ok(
    /document\.contains\(previouslyFocused\)/.test(SOURCE),
    'the opener can be removed from the DOM by the time this runs (e.g. its row was removed by a refetch after the confirmed action completed) -- restoring focus must stay a safe no-op in that case',
  );
});

test('focus-restore effect is keyed on `open`, mirroring the shared Modal component', () => {
  assert.ok(
    /previouslyFocused\.focus\(\);\s*\};\s*\}, \[open\]\);/.test(SOURCE),
    'the cleanup must run on every open->close transition (Cancel/Escape/backdrop), not just unmount',
  );
});
