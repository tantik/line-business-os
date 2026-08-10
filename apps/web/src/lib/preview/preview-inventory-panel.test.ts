import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));

test('the Staff Inventory sticky Save builds FormData from tracked state, not a stale DOM event target', () => {
  const source = readFileSync(path.join(THIS_DIR, 'preview-inventory-staff-panel.tsx'), 'utf8');

  // The staff panel saves via one sticky "Save" button that submits every
  // changed item sequentially, not a per-item <form onSubmit>. There is no
  // DOM event to read across the async gap, so each item's FormData is
  // built from component state (`values[item.itemId]`) instead.
  assert.ok(
    !source.includes('event.currentTarget'),
    'the sticky Save flow must not depend on a DOM form event target across an async gap',
  );
  assert.match(source, /new FormData\(\)/, 'each item save should build FormData from tracked component state');
});

test('reachable Inventory panels use language-aware write errors', () => {
  for (const file of ['preview-inventory-staff-panel.tsx', 'preview-inventory-manager-panel.tsx']) {
    const source = readFileSync(path.join(THIS_DIR, file), 'utf8');
    assert.match(source, /previewWriteMessage\(lang,/);
    assert.ok(!source.includes('previewWriteMessageJa('));
  }
});

test('Inventory exposes a reusable modal entry point and separate target/reorder levels', () => {
  const staff = readFileSync(path.join(THIS_DIR, 'preview-inventory-staff-panel.tsx'), 'utf8');
  const manager = readFileSync(path.join(THIS_DIR, 'preview-inventory-manager-panel.tsx'), 'utf8');
  const modal = readFileSync(path.join(THIS_DIR, 'preview-inventory-modal.tsx'), 'utf8');

  assert.match(staff, /PreviewInventoryModal/);
  assert.match(manager, /PreviewInventoryModal/);
  assert.match(manager, /name="requiredQuantity"/);
  assert.match(manager, /name="reorderPoint"/);
  assert.match(staff, /item\.reorderPoint/);
  assert.match(modal, /role="dialog"/);
  assert.match(modal, /aria-modal="true"/);
});

test('Staff Inventory renders a bilingual no-results state for search and shortage filters', () => {
  const source = readFileSync(path.join(THIS_DIR, 'preview-inventory-staff-panel.tsx'), 'utf8');

  assert.match(source, /noSearchResults: '検索条件に一致する商品はありません。'/);
  assert.match(source, /noSearchResults: 'No items match your search.'/);
  assert.match(source, /visibleItems\.length === 0/);
  assert.match(source, /tr\('noSearchResults'\)/);
});

test('Manager and Staff Inventory both offer Search/All/Need reorder/OK filters that compose, reusing the canonical status field (never a second frontend shortage calculation)', () => {
  for (const file of ['preview-inventory-staff-panel.tsx', 'preview-inventory-manager-panel.tsx']) {
    const source = readFileSync(path.join(THIS_DIR, file), 'utf8');
    assert.match(source, /useState<'all' \| 'shortage' \| 'ok'>\('all'\)/, `${file} must track a three-way status filter`);
    assert.match(source, /searchFilteredItems/, `${file} must filter by search before applying the status filter, so they compose`);
    assert.match(source, /item\.status === 'shortage'/, `${file} must reuse the canonical status field for "Need reorder", not a new calculation`);
    assert.ok(!/item\.actualQuantity <= item\.reorderPoint/.test(source), `${file} must not recompute shortage in the frontend`);
  }
});

test('Manager Inventory gates the reorder-status filters on isActive so a deactivated item only ever surfaces under All', () => {
  const source = readFileSync(path.join(THIS_DIR, 'preview-inventory-manager-panel.tsx'), 'utf8');
  assert.match(source, /item\.isActive && item\.status === 'shortage'/);
  assert.match(source, /item\.isActive && item\.status !== 'shortage'/);
});

