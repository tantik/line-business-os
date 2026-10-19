import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as helpContent from '../demo/cafe/helpContent.js';

/**
 * Regression guard for the "language toggle doesn't translate anything"
 * bug: `PreviewLanguageToggle` previously held its own local `useState`,
 * completely disconnected from the shared `LangProvider`/`useLang()`
 * mechanism, so clicking it only re-highlighted itself. Static source-text
 * checks (no component-rendering harness in this repo's test runner).
 */

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
function read(relativeToThisFile: string): string {
  return readFileSync(path.join(THIS_DIR, relativeToThisFile), 'utf8');
}

test('PreviewLanguageToggle reads/writes the shared LangProvider state, not a local disconnected useState', () => {
  const source = read('preview-language-toggle.tsx');
  assert.match(source, /useLang\(\)/, 'must call the shared useLang() hook');
  assert.match(source, /setLang\(/, 'must call the shared setLang() to change language');
  assert.ok(!/useState<'ja' \| 'en'>/.test(source), 'must not reintroduce a local, disconnected lang useState');
});

test('Staff Recipes shows translated content without exposing the translation mechanism', () => {
  const source = read('../../components/demo/cafe/RecipeDetail.tsx');
  assert.ok(
    !source.includes('Machine translation'),
    'operator-facing recipe detail must show the translation result, not the internal mechanism',
  );
});

test('every shared Cafe help popup provides both Japanese and English copy', () => {
  const definitions = Object.entries(helpContent).filter(([name]) => name.startsWith('HELP_'));
  assert.ok(definitions.length > 0, 'expected shared Cafe help definitions');
  for (const [name, value] of definitions) {
    assert.ok(value.ja?.title && value.ja?.body, `${name} must provide Japanese copy`);
    assert.ok(value.en?.title && value.en?.body, `${name} must provide English copy`);
  }

  const buttonSource = read('../../components/demo/cafe/DemoHelpButton.tsx');
  assert.match(buttonSource, /content\[lang\]/, 'the help button must select copy from the active language');

  const modalSource = read('../../components/demo/cafe/Modal.tsx');
  assert.match(modalSource, /useLang\(\)/, 'the shared modal close control must read the active language');
  assert.match(modalSource, /lang === 'ja' \? '閉じる' : 'Close'/, 'the shared modal close label must be bilingual');
});
