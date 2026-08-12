import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.join(THIS_DIR, 'preview-staff-form.tsx'), 'utf8');

test('Founder QA F05 regression: a staff row with protected history shows the blocked-by-history explanation up front (same wording as the actual delete failure), instead of only after a failed delete attempt', () => {
  assert.match(source, /s\.hasProtectedHistory \? \(/);
  assert.match(source, /previewStaffDeleteMessage\(lang, 'blocked_by_history'\)/);
});

test('Founder QA F05 regression: Delete stays enabled even when history is protected - the safety guard is not weakened, only explained in advance', () => {
  const deleteButtonBlock = source.slice(source.indexOf("{t('deleteStaffButton')}") - 400, source.indexOf("{t('deleteStaffButton')}"));
  assert.ok(!deleteButtonBlock.includes('disabled={isPending || s.hasProtectedHistory}'));
});
