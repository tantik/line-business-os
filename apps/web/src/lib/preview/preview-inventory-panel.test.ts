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

