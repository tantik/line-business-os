'use client';

import { useEffect, useRef } from 'react';

/**
 * DEBT-119 (c): stack-aware Escape handling for the design-kit overlays
 * (`Modal`, `ConfirmDialog`, `ActionsMenu`).
 *
 * Before this, `ConfirmDialog` listened for Escape on `document` and `Modal`
 * on `window`, each unconditionally - so with a confirmation open inside a
 * Modal (e.g. the /manager staff popup's delete / 店長にする confirm) ONE
 * Escape closed both layers. Now every open overlay pushes a layer onto one
 * module-level stack, a single `document` keydown listener is attached while
 * the stack is non-empty, and Escape is delivered to the topmost layer only.
 * The next Escape then reaches the layer below.
 *
 * Layers are pushed when an overlay opens and removed when it closes or
 * unmounts, so the order is "most recently opened on top". A layer that is
 * busy (ConfirmDialog with `pending`) still receives - and swallows - the
 * Escape, so the Modal below never closes while a confirmation is in flight.
 *
 * Known limit: if an outer and an inner overlay both become open in the SAME
 * React commit, React runs the inner (child) effect first, so the inner layer
 * would sit below the outer one. Every current nested use opens the inner
 * confirmation from a user action inside an already-open Modal, so this does
 * not occur today.
 *
 * The pure functions below take no DOM dependency so they can be unit-tested
 * under this repo's plain `node --test` runner (no DOM harness).
 */

export interface OverlayKeyEvent {
  key: string;
  /** True while an IME (e.g. Japanese input) is composing; Escape then cancels the composition, not the dialog. */
  isComposing?: boolean;
  /** Auto-repeat from a held key: ignored so holding Escape does not close every layer in turn. */
  repeat?: boolean;
  /** 229 = "IME is processing" - Safari reports the Escape that ends a composition with this and `isComposing: false`. */
  keyCode?: number;
}

interface OverlayLayer {
  onEscape: () => void;
}

const stack: OverlayLayer[] = [];
let listening = false;

function onDocumentKeyDown(event: KeyboardEvent): void {
  handleOverlayKeyDown(event);
}

function syncDocumentListener(): void {
  if (typeof document === 'undefined') return;
  if (stack.length > 0 && !listening) {
    document.addEventListener('keydown', onDocumentKeyDown);
    listening = true;
  } else if (stack.length === 0 && listening) {
    document.removeEventListener('keydown', onDocumentKeyDown);
    listening = false;
  }
}

/**
 * Delivers an Escape key event to the topmost open layer only. Returns true
 * when a layer received it. Exported for unit tests; components use
 * `useOverlayEscape`.
 */
export function handleOverlayKeyDown(event: OverlayKeyEvent): boolean {
  if (event.key !== 'Escape' || event.isComposing || event.repeat || event.keyCode === 229) return false;
  const top = stack[stack.length - 1];
  if (!top) return false;
  top.onEscape();
  return true;
}

/**
 * Pushes a new top layer. Returns a release function that removes exactly
 * that layer (safe to call more than once, and safe if layers are released
 * out of order).
 */
export function pushOverlayLayer(onEscape: () => void): () => void {
  const layer: OverlayLayer = { onEscape };
  stack.push(layer);
  syncDocumentListener();
  return () => {
    const index = stack.indexOf(layer);
    if (index >= 0) stack.splice(index, 1);
    syncDocumentListener();
  };
}

/** Number of currently open layers. Exported for unit tests. */
export function overlayStackDepth(): number {
  return stack.length;
}

/**
 * Registers the calling overlay as a layer while `open` is true. The layer is
 * keyed on `open` only - NOT on `onEscape`, which callers usually pass as a
 * fresh inline closure every render: re-registering on every render would
 * re-push an outer Modal above its open ConfirmDialog whenever the Modal's
 * parent re-rendered. The latest `onEscape` is read through a ref instead.
 */
export function useOverlayEscape(open: boolean, onEscape: () => void): void {
  const onEscapeRef = useRef(onEscape);
  useEffect(() => {
    onEscapeRef.current = onEscape;
  });
  useEffect(() => {
    if (!open) return;
    return pushOverlayLayer(() => onEscapeRef.current());
  }, [open]);
}
