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
 * checks, matching the convention in `preview-action-free.test.ts` /
 * `manager-screen-unification.test.ts`.
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

test('the Mame To Cha preview layout mounts LangProvider for the whole route tree (including early-return safe states)', () => {
  const source = read('../../app/%5Fclient-preview/mame-to-cha/layout.tsx');
  assert.match(source, /LangProvider/, 'the shared layout must mount LangProvider once for every preview route');
});

test('preview pages do not each mount their own redundant LangProvider (centralized in layout.tsx)', () => {
  for (const page of [
    '../../app/%5Fclient-preview/mame-to-cha/page.tsx',
    '../../app/%5Fclient-preview/mame-to-cha/manager/page.tsx',
    '../../app/%5Fclient-preview/mame-to-cha/recipes/page.tsx',
  ]) {
    const source = read(page);
    assert.ok(!/LangProvider/.test(source), `${page} must not mount its own LangProvider -- it is provided by layout.tsx`);
  }
});

test('states.tsx safe-state components read the shared lang instead of hardcoding Japanese', () => {
  const source = read('states.tsx');
  assert.match(source, /useLang\(\)/, 'safe states must translate via the shared useLang() hook');
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

test('Preview recipe management does not open a nested modal', () => {
  const source = read('preview-recipe-kind-manager.tsx');
  assert.ok(!source.includes('<Modal'), 'recipe editor must stay inside the single parent management modal');
});

test('an empty shift-exchange approval list is not rendered', () => {
  const source = read('preview-shift-exchange-manager-panel.tsx');
  assert.match(source, /if \(relevant\.length === 0\) return null/);
});
