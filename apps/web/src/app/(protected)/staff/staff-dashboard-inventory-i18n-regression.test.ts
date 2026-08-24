import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Cafe v2.1 canonical Staff consolidation, Inventory + JA/EN gap closure.
 * Source-text regression guards (same convention as `ConfirmDialog.test.ts`
 * -- this repo's `node --test` runner has no DOM/React harness) locking in
 * two architecture decisions so a future edit can't silently regress them:
 *
 * 1. Inventory: the Staff page opens the Inventory popup (`StaffInventoryPopup`,
 *    `./inventory-popup.tsx`), which embeds the exact same shared
 *    `InventoryDashboardBody` the canonical `/inventory` page and the
 *    Manager dashboard's own `InventoryPopup` use -- one write UI, reused,
 *    never a second copy built directly into this file. `page.tsx` itself
 *    still never imports a write/mutation action directly; those live only
 *    inside the shared Inventory components.
 * 2. JA/EN: the schedule/exchange/inventory-entry section this consolidation
 *    added is wrapped in the shared `LangProvider` and reads `lang` from
 *    `useLang()` rather than hardcoding `'en'`.
 */
const PAGE_SOURCE = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');
const CLIENT_SOURCE = readFileSync(new URL('./staff-dashboard-client.tsx', import.meta.url), 'utf8');
const EXCHANGE_FORM_SOURCE = readFileSync(new URL('./shift-exchange-request-form.tsx', import.meta.url), 'utf8');

test('staff page.tsx reads Inventory item status (read-only) for the entry-point card', () => {
  assert.match(PAGE_SOURCE, /listInventoryItemStatus/, 'must read inventory item status for the shortage summary');
});

test('staff page.tsx never imports an Inventory write/mutation action -- writes stay on the canonical /inventory page', () => {
  assert.doesNotMatch(
    PAGE_SOURCE,
    /recordInventoryStockCount|inventory\/count-actions|inventory\/manager-actions/,
    'the Staff page must not duplicate Inventory write actions; it only reads for display and links to /inventory for the real write UI',
  );
});

test('staff-dashboard-client.tsx opens the shared Inventory popup rather than embedding its own count-entry form', () => {
  assert.match(CLIENT_SOURCE, /StaffInventoryPopup/, 'must open the Staff Inventory popup');
  assert.doesNotMatch(
    CLIENT_SOURCE,
    /CountForm|ItemForm|recordInventoryStockCountAction/,
    'must not import the canonical Inventory page\'s own write-form components directly -- the shared popup/dashboard-body components own that, not this file',
  );
});

test('staff-dashboard-client.tsx wires the shared LangProvider/useLang mechanism around the consolidation-added section, never a hardcoded lang literal on ShiftTable/ShiftLegend', () => {
  assert.match(CLIENT_SOURCE, /LangProvider/, 'must mount LangProvider so useLang() is available');
  assert.match(CLIENT_SOURCE, /useLang\(\)/, 'must read the shared language state');
  assert.match(CLIENT_SOURCE, /<ShiftTable[\s\S]*?lang=\{lang\}/, 'ShiftTable must receive the live lang, not a hardcoded literal');
  assert.match(CLIENT_SOURCE, /<ShiftLegend[\s\S]*?lang=\{lang\}/, 'ShiftLegend must receive the live lang, not a hardcoded literal');
  assert.doesNotMatch(CLIENT_SOURCE, /lang="en"/, 'no hardcoded English-only lang literal should remain on the consolidation-added components');
});

test('ShiftExchangeRequestForm requires an explicit lang prop and uses the localized error mapper, not the English-only error-copy module', () => {
  assert.match(EXCHANGE_FORM_SOURCE, /lang:\s*Lang/, 'must declare a typed lang prop');
  assert.match(EXCHANGE_FORM_SOURCE, /describeExchangeError/, 'must use the JA/EN-aware error mapper');
  assert.doesNotMatch(EXCHANGE_FORM_SOURCE, /describeWriteError/, 'must not fall back to the English-only shared error-copy helper');
});

test('the Inventory entry-point card never sends a client-supplied employee identity -- it only links to the canonical page, which resolves identity server-side', () => {
  assert.doesNotMatch(
    CLIENT_SOURCE,
    /employeeId\s*[:=]\s*profile\.staffId.*inventory/i,
    'the inventory section must not thread a client-held employee id into any inventory call',
  );
});
