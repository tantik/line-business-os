import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { handleOverlayKeyDown, overlayStackDepth, pushOverlayLayer } from './overlayStack';
import { restoreFocusTo } from './useRestoreFocusOnClose';

/**
 * DEBT-119 (c): one Escape must close only the topmost design-kit overlay
 * (a `ConfirmDialog` opened inside a `Modal`), and focus must go back to the
 * element that opened the closed layer. This repo's `node --test` runner has
 * no DOM/React-rendering harness, so the stack and the focus-restore step are
 * exercised as pure functions; source-text checks below pin that `Modal` and
 * `ConfirmDialog` actually use them (and no longer attach their own Escape
 * listeners).
 */

const MODAL_SOURCE = readFileSync(new URL('./Modal.tsx', import.meta.url), 'utf8');
const CONFIRM_DIALOG_SOURCE = readFileSync(new URL('./ConfirmDialog.tsx', import.meta.url), 'utf8');

const releases: Array<() => void> = [];
function open(onEscape: () => void): () => void {
  const release = pushOverlayLayer(onEscape);
  releases.push(release);
  return release;
}
afterEach(() => {
  while (releases.length) releases.pop()?.();
  assert.equal(overlayStackDepth(), 0);
});

const ESCAPE = { key: 'Escape' };

/** Minimal stand-in for a focusable element plus `document.activeElement`. */
function fakeFocusWorld() {
  const world = { active: null as FakeEl | null };
  class FakeEl {
    isConnected = true;
    disabled = false;
    constructor(readonly name: string) {}
    focus() {
      world.active = this;
    }
  }
  return { world, el: (name: string) => new FakeEl(name) };
}

test('nested Escape closes only the inner layer; the second Escape closes the outer', () => {
  const closed: string[] = [];
  let releaseModal = () => {};
  let releaseConfirm = () => {};
  releaseModal = open(() => {
    closed.push('modal');
    releaseModal();
  });
  releaseConfirm = open(() => {
    closed.push('confirm');
    releaseConfirm();
  });

  assert.equal(handleOverlayKeyDown(ESCAPE), true);
  assert.deepEqual(closed, ['confirm']);
  assert.equal(overlayStackDepth(), 1);

  assert.equal(handleOverlayKeyDown(ESCAPE), true);
  assert.deepEqual(closed, ['confirm', 'modal']);
  assert.equal(overlayStackDepth(), 0);

  assert.equal(handleOverlayKeyDown(ESCAPE), false, 'with nothing open, Escape is a no-op');
});

test('a busy (pending) top layer swallows Escape - the layer below does not close', () => {
  const closed: string[] = [];
  open(() => closed.push('modal'));
  const pending = true;
  open(() => {
    if (!pending) closed.push('confirm');
  });
  assert.equal(handleOverlayKeyDown(ESCAPE), true);
  assert.deepEqual(closed, []);
  assert.equal(overlayStackDepth(), 2);
});

test('non-Escape keys and Escape during IME composition are ignored', () => {
  const closed: string[] = [];
  open(() => closed.push('modal'));
  assert.equal(handleOverlayKeyDown({ key: 'Enter' }), false);
  assert.equal(handleOverlayKeyDown({ key: 'Escape', isComposing: true }), false);
  assert.deepEqual(closed, []);
});

test('closing the inner layer by other means (Cancel / backdrop) hands Escape back to the outer layer', () => {
  const closed: string[] = [];
  open(() => closed.push('modal'));
  const releaseConfirm = open(() => closed.push('confirm'));
  releaseConfirm();
  releaseConfirm(); // idempotent
  handleOverlayKeyDown(ESCAPE);
  assert.deepEqual(closed, ['modal']);
});

test('releasing layers out of order removes exactly the released one', () => {
  const closed: string[] = [];
  const releaseA = open(() => closed.push('a'));
  open(() => closed.push('b'));
  releaseA();
  assert.equal(overlayStackDepth(), 1);
  handleOverlayKeyDown(ESCAPE);
  assert.deepEqual(closed, ['b']);
});

test('focus returns to each layer\'s own opener as the layers close (inner first, then outer)', () => {
  const { world, el } = fakeFocusWorld();
  const pageTrigger = el('staff row button');
  const deleteButton = el('delete button inside the Modal');

  // Modal opens from the page trigger, ConfirmDialog from a button inside it;
  // each captures document.activeElement on open (useRestoreFocusOnClose).
  pageTrigger.focus();
  const modalOpener = world.active;
  let releaseModal = () => {};
  releaseModal = open(() => {
    releaseModal();
    restoreFocusTo(modalOpener);
  });
  deleteButton.focus();
  const confirmOpener = world.active;
  let releaseConfirm = () => {};
  releaseConfirm = open(() => {
    releaseConfirm();
    restoreFocusTo(confirmOpener);
  });
  world.active = null; // focus moved into the dialog

  handleOverlayKeyDown(ESCAPE);
  assert.equal(world.active, deleteButton, 'first Escape: focus back on the button that opened the confirmation');
  handleOverlayKeyDown(ESCAPE);
  assert.equal(world.active, pageTrigger, 'second Escape: focus back on the element that opened the Modal');
});

test('restoreFocusTo is a safe no-op for a removed, disabled, or missing opener', () => {
  const { world, el } = fakeFocusWorld();
  const removed = el('removed');
  removed.isConnected = false;
  restoreFocusTo(removed);
  const disabled = el('disabled');
  disabled.disabled = true;
  restoreFocusTo(disabled);
  restoreFocusTo(null);
  assert.equal(world.active, null);
});

test('Modal and ConfirmDialog route Escape through the shared overlay stack, with no listener of their own', () => {
  for (const [name, source] of [['Modal', MODAL_SOURCE], ['ConfirmDialog', CONFIRM_DIALOG_SOURCE]] as const) {
    assert.ok(/import \{ useOverlayEscape \} from '\.\/overlayStack'/.test(source), `${name} must import useOverlayEscape`);
    assert.ok(/useOverlayEscape\(open, /.test(source), `${name} must register itself while open`);
    assert.ok(!/addEventListener\('keydown'/.test(source), `${name} must not attach its own keydown listener`);
  }
});

test('ConfirmDialog keeps blocking Escape while pending', () => {
  assert.ok(/useOverlayEscape\(open, \(\) => \{\s*if \(!pending\) onCancel\(\);\s*\}\);/.test(CONFIRM_DIALOG_SOURCE));
});
