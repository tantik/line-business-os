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

test('Founder QA F06 regression: the header row wraps and the Add recipe button never shrinks below its content (no multi-line JA button text)', () => {
  const headerBlock = source.slice(source.indexOf("display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between'"), source.indexOf("'レシピを追加'"));
  assert.match(headerBlock, /flexWrap: 'wrap'/);
  assert.match(headerBlock, /flexShrink: 0, whiteSpace: 'nowrap'/);
});

test('Founder QA F07 regression: the original-language field states plainly that the source is saved exactly and the other language is generated automatically', () => {
  assert.match(source, /元の言語/);
  assert.match(source, /'以下の内容は入力したとおりに保存されます。もう一方の言語は自動的に生成されます。'/);
  assert.match(source, /'The text below is saved exactly as entered\. The other language is generated automatically\.'/);
  // The old, confusing wording must be gone.
  assert.ok(!source.includes('Original language (the language you are writing in)'));
});

test('Founder QA F07B regression: the edit form shows an honest translation-readiness indicator for the other language, sourced from the server (not a client guess)', () => {
  assert.match(source, /detail\?\.otherLanguageTranslationReady/);
  assert.match(source, /'翻訳: 準備完了'/);
  assert.match(source, /'Translation: unavailable — original shown'/);
});
