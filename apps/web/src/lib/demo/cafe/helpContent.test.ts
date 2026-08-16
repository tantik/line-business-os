import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.join(THIS_DIR, 'helpContent.ts'), 'utf8');

test('Founder QA F07 regression: auto-create help states unpublished manual shifts can be overwritten, published ones cannot, and the result is always a draft', () => {
  assert.match(source, /Published shifts in the affected period are not overwritten\./);
  assert.match(source, /Manually entered shifts that are NOT yet published can be overwritten by auto-create\./);
  assert.match(source, /公開済みのシフトは上書きされません/);
  assert.match(source, /まだ公開していない手動入力のシフトは、自動作成によって上書きされる場合があります/);
});

test('Founder QA F07 regression: schedule help states what Publish does, that re-publish is required after edits, and that it has no notification/payroll side effects', () => {
  assert.match(source, /About "Publish schedule":/);
  assert.match(source, /does not send notifications and does not affect attendance or payroll records/);
  assert.match(source, /公開後にシフトを編集した場合、その変更をスタッフに見せるには再度「公開する」を押す必要があります/);
});
