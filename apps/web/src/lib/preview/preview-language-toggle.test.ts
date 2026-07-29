import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

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
