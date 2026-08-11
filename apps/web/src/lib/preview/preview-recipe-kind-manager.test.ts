import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.join(THIS_DIR, 'preview-recipe-kind-manager.tsx'), 'utf8');

test('an archived recipe row renders an "Archived" status label, not "Draft"', () => {
  assert.match(source, /recipe\.status === 'archived'[\s\S]{0,40}\?\s*\(lang === 'ja' \? 'アーカイブ' : 'Archived'\)/);
  assert.match(source, /recipe\.status === 'published'[\s\S]{0,200}recipe\.status === 'archived'/);
});
