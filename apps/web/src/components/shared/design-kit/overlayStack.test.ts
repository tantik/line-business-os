import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { handleOverlayKeyDown, overlayStackDepth, pushOverlayLayer } from './overlayStack';
import { restoreFocusTo } from './useRestoreFocusOnClose';

/**
 * DEBT-119 (c): one Escape must close only the topmost design-kit overlay
 * (a `ConfirmDialog` or `ActionsMenu` opened inside a `Modal`), and focus must
 * go back to the element that opened the closed layer. This repo's
 * `node --test` runner has no DOM/React-rendering harness, so the stack and
 * the focus-restore step are exercised as pure functions; source-text checks
 * below pin that the components actually use them (and no longer attach
 * their own Escape listeners).
 */

const STACK_SOURCE = readFileSync(new URL('./overlayStack.ts', import.meta.url), 'utf8');
const MODAL_SOURCE = readFileSync(new URL('./Modal.tsx', import.meta.url), 'utf8');
const CONFIRM_DIALOG_SOURCE = readFileSync(new URL('./ConfirmDialog.tsx', import.meta.url), 'utf8');
const ACTIONS_MENU_SOURCE = readFileSync(new URL('./ActionsMenu.tsx', import.meta.url), 'utf8');

const releases: Array<() => void> = [];
function open(onEscape: () => void): () => void {
  const release = pushOverlayLayer(onEscape);
  releases.push(release);
  return release;
}
/** A layer that, like the real components, leaves the stack when its Escape handler closes it. */
function openClosingLayer(name: string, closed: string[]): void {
  let release = () => {};
  release = open(() => {
    closed.push(name);
    release();
  });
}
afterEach(() => {
  while (releases.length) releases.pop()?.();
  assert.equal(overlayStackDepth(), 0);
});

const ESCAPE = { key: 'Escape' };

test('nested Escape closes only the inner layer; the second Escape closes the outer', () => {
  const closed: string[] = [];
  openClosingLayer('modal', closed);
  openClosingLayer('confirm', closed);

  assert.equal(handleOverlayKeyDown(ESCAPE), true);
  assert.deepEqual(closed, ['confirm']);
  assert.equal(overlayStackDepth(), 1);

  assert.equal(handleOverlayKeyDown(ESCAPE), true);
  assert.deepEqual(closed, ['confirm', 'modal']);
  assert.equal(overlayStackDepth(), 0);

  assert.equal(handleOverlayKeyDown(ESCAPE), false, 'with nothing open, Escape is a no-op');
});

test('three levels (Modal > ActionsMenu, then Modal > ConfirmDialog) unwind one per Escape', () => {
  const closed: string[] = [];
  openClosingLayer('modal', closed);
  openClosingLayer('menu', closed);
  handleOverlayKeyDown(ESCAPE);
  openClosingLayer('confirm', closed);
  handleOverlayKeyDown(ESCAPE);
  handleOverlayKeyDown(ESCAPE);
  assert.deepEqual(closed, ['menu', 'confirm', 'modal']);
});

test('a top layer that stays open on Escape (busy ConfirmDialog) never lets it fall through to the layer below', () => {
  const closed: string[] = [];
  openClosingLayer('modal', closed);
  let escapesSeenByBusyLayer = 0;
  open(() => {
    escapesSeenByBusyLayer += 1; // stays open: does not release itself
  });
  handleOverlayKeyDown(ESCAPE);
  handleOverlayKeyDown(ESCAPE);
  assert.equal(escapesSeenByBusyLayer, 2);
  assert.deepEqual(closed, [], 'the Modal below must not close while the confirmation is busy');
  assert.equal(overlayStackDepth(), 2);
});

test('ignored: non-Escape keys, IME composition, Safari IME-end (keyCode 229), and auto-repeat', () => {
  const closed: string[] = [];
  openClosingLayer('modal', closed);
  assert.equal(handleOverlayKeyDown({ key: 'Enter' }), false);
  assert.equal(handleOverlayKeyDown({ key: 'Escape', isComposing: true }), false);
  assert.equal(handleOverlayKeyDown({ key: 'Escape', keyCode: 229 }), false);
  assert.equal(handleOverlayKeyDown({ key: 'Escape', repeat: true }), false);
  assert.deepEqual(closed, []);
  assert.equal(handleOverlayKeyDown({ key: 'Escape', keyCode: 27, repeat: false, isComposing: false }), true);
  assert.deepEqual(closed, ['modal']);
});

test('closing the inner layer by other means (Cancel / backdrop) hands Escape back to the outer layer', () => {
  const closed: string[] = [];
  openClosingLayer('modal', closed);
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

test('restoreFocusTo focuses a still-connected, enabled opener', () => {
  const { world, el } = fakeFocusWorld();
  const opener = el('delete button inside the Modal');
  restoreFocusTo(opener);
  assert.equal(world.active, opener);
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

test('useOverlayEscape registers on `open` only, so a re-render with a new inline handler never re-pushes an outer layer above an open inner one', () => {
  assert.ok(/return pushOverlayLayer\(\(\) => onEscapeRef\.current\(\)\);\s*\}, \[open\]\);/.test(STACK_SOURCE));
});

test('Modal, ConfirmDialog and ActionsMenu route Escape through the shared overlay stack, with no keydown listener of their own', () => {
  for (const [name, source] of [
    ['Modal', MODAL_SOURCE],
    ['ConfirmDialog', CONFIRM_DIALOG_SOURCE],
    ['ActionsMenu', ACTIONS_MENU_SOURCE],
  ] as const) {
    assert.ok(/import \{ useOverlayEscape \} from '\.\/overlayStack'/.test(source), `${name} must import useOverlayEscape`);
    assert.ok(/useOverlayEscape\(open, /.test(source), `${name} must register itself while open`);
    assert.ok(!/addEventListener\('keydown'/.test(source), `${name} must not attach its own keydown listener`);
  }
});

test('ConfirmDialog keeps blocking Escape while pending', () => {
  assert.ok(/useOverlayEscape\(open, \(\) => \{\s*if \(!pending\) onCancel\(\);\s*\}\);/.test(CONFIRM_DIALOG_SOURCE));
});

test('ActionsMenu returns focus to its ••• trigger when Escape closes it', () => {
  assert.ok(/useOverlayEscape\(open, \(\) => \{\s*setOpen\(false\);\s*triggerRef\.current\?\.focus\(\);\s*\}\);/.test(ACTIONS_MENU_SOURCE));
});
