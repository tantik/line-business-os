import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * QA3 finding 2026-10-13: the Inventory row "•••" did nothing in the Manager/
 * Staff Inventory popup. That popup is a Radix `Dialog` (`_ui/inventory-popup.tsx`),
 * which makes everything outside its own layer non-interactive; the design-kit
 * `ActionsMenu` portals its panel to `document.body`, i.e. outside that layer.
 * The rows must use the Radix-based `Menu` from `@line-os/ui`, which stacks
 * correctly inside a Radix Dialog.
 */
const CLIENT = readFileSync(new URL('./inventory-dashboard-client.tsx', import.meta.url), 'utf8');
const POPUP = readFileSync(new URL('../_ui/inventory-popup.tsx', import.meta.url), 'utf8');

test('the Inventory popup is a Radix Dialog (the reason ActionsMenu cannot be used inside it)', () => {
  assert.match(POPUP, /import \{ Dialog \} from '@line-os\/ui'/);
});

test('the photo lightbox (used inside the Inventory and Recipes Radix popups) is the Radix ImageViewer, not a hand-made body portal', () => {
  const lightbox = readFileSync(new URL('../../../components/shared/design-kit/Lightbox.tsx', import.meta.url), 'utf8');
  assert.match(lightbox, /import \{ ImageViewer \} from '@line-os\/ui'/);
  assert.doesNotMatch(lightbox, /createPortal/);
});

test('Inventory rows use the Radix Menu, never the body-portaled design-kit ActionsMenu', () => {
  assert.match(CLIENT, /import \{ Menu \} from '@line-os\/ui'/);
  assert.doesNotMatch(CLIENT, /<ActionsMenu/);
  assert.equal((CLIENT.match(/<Menu\b/g) ?? []).length, 2, 'both the table row and the mobile card use Menu');
});
