import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));

test('the Staff Inventory form captures its form before awaiting the Server Action', () => {
  const source = readFileSync(path.join(THIS_DIR, 'preview-inventory-staff-panel.tsx'), 'utf8');

  assert.match(source, /const form = event\.currentTarget;/);
  assert.match(source, /const formData = new FormData\(form\);/);
  assert.match(source, /form\.reset\(\);/);
  assert.ok(
    !source.includes('(event.currentTarget as HTMLFormElement).reset()'),
    'React clears currentTarget after the event handler yields; the async callback must use the captured form',
  );
});

test('reachable Inventory panels use language-aware write errors', () => {
  for (const file of ['preview-inventory-staff-panel.tsx', 'preview-inventory-manager-panel.tsx']) {
    const source = readFileSync(path.join(THIS_DIR, file), 'utf8');
    assert.match(source, /previewWriteMessage\(lang,/);
    assert.ok(!source.includes('previewWriteMessageJa('));
  }
});

