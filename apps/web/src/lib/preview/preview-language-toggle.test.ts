import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as helpContent from '../demo/cafe/helpContent.js';
import { resolveRecipeListTitle, resolveRecipeListSourceTitle, resolveRecipeListTranslationTitle } from './recipe-list-title.js';
import { withResolvedRecipeListTitles } from './manager-recipe-title-translations.js';
import { hashSourceText, type ContentTranslation } from '../content/translations.js';

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
  assert.match(source, /previewListRecipeMediaUrls/, 'recipe list thumbnails must load from signed private-media URLs');
  assert.match(source, /type="hidden" name="removePhoto"/, 'photo removal must use the compact button state, not a checkbox');
  assert.ok(!source.includes('type="checkbox" name="removePhoto"'), 'photo removal must not regress to a checkbox');
});

test('Cafe staff management hides the unused employment-type field without destroying stored values', () => {
  const source = read('preview-staff-form.tsx');
  assert.ok(!source.includes("t('employmentType')"), 'Cafe staff form must not show the unused employment-type input');
  assert.match(source, /type="hidden" name="employmentType"/, 'an existing employment type must survive unrelated profile edits');
});

test('an empty shift-exchange approval list is not rendered', () => {
  const source = read('preview-shift-exchange-manager-panel.tsx');
  assert.match(source, /if \(relevant\.length === 0\) return null/);
});

test('Manager recipe list resolves the recipe title from the active language, not always Japanese', async (t) => {
  const baseRecipe = { titleJa: '抹茶ラテ' };

  await t.test('Japanese mode renders titleJa regardless of titleEn', () => {
    assert.equal(resolveRecipeListTitle({ ...baseRecipe, titleEn: 'Matcha Latte' }, 'ja'), '抹茶ラテ');
    assert.equal(resolveRecipeListTitle({ ...baseRecipe, titleEn: null }, 'ja'), '抹茶ラテ');
  });

  await t.test('English mode renders titleEn when it is a non-empty, non-whitespace value', () => {
    assert.equal(resolveRecipeListTitle({ ...baseRecipe, titleEn: 'Matcha Latte' }, 'en'), 'Matcha Latte');
  });

  await t.test('English mode falls back to titleJa when titleEn is null, undefined, empty, or whitespace-only', () => {
    assert.equal(resolveRecipeListTitle({ ...baseRecipe, titleEn: null }, 'en'), '抹茶ラテ');
    assert.equal(resolveRecipeListTitle({ ...baseRecipe, titleEn: undefined as unknown as null }, 'en'), '抹茶ラテ');
    assert.equal(resolveRecipeListTitle({ ...baseRecipe, titleEn: '' }, 'en'), '抹茶ラテ');
    assert.equal(resolveRecipeListTitle({ ...baseRecipe, titleEn: '   ' }, 'en'), '抹茶ラテ');
  });

  // Integration guard: search filtering must still go through this exact
  // canonical viewer-language resolver, not a re-inlined copy.
  const source = read('preview-recipe-kind-manager.tsx');
  assert.match(source, /from '\.\/recipe-list-title'/, 'the component must import the canonical resolvers rather than reimplementing them');
  assert.match(source, /resolveRecipeListTitle\(recipe, lang\)\.toLowerCase\(\)/, 'search filtering must go through the canonical viewer-language resolver');
  assert.ok(
    !source.includes('manager-recipe-title-translations'),
    'the client list must not import the server-side translation overlay or node:crypto',
  );
});

test('Manager recipe list row renders the human-authored SOURCE title as primary, never a silent machine translation', () => {
  const source = read('preview-recipe-kind-manager.tsx');
  assert.match(
    source,
    /title=\{resolveRecipeListSourceTitle\(recipe\)\}/,
    "the row's primary (bold) title must render through resolveRecipeListSourceTitle, not the viewer-language resolver -- " +
      'Founder recipe contract Part J: Manager authoring surfaces must never show a translation as if it were what was typed',
  );
  assert.match(
    source,
    /translationTitle=\{resolveRecipeListTranslationTitle\(recipe, lang\)\}/,
    'the row must pass a separate, explicitly-labeled translation line rather than folding translated text into the primary title',
  );
});

test("resolveRecipeListSourceTitle always returns the recipe's own originalLanguage text, ignoring viewer language", () => {
  // JA-original: source is titleJa even when titleEn (a machine translation)
  // exists and looks perfectly plausible as a title.
  assert.equal(
    resolveRecipeListSourceTitle({ titleJa: '抹茶 Latte 250ml / ICE を使用する', titleEn: 'Matcha Latte 250ml / uses ICE', originalLanguage: 'ja' }),
    '抹茶 Latte 250ml / ICE を使用する',
    'ja-original recipe: source title is titleJa verbatim, mixed-language content preserved exactly',
  );
  // EN-original: source is titleEn even when titleJa (a machine translation)
  // exists.
  assert.equal(
    resolveRecipeListSourceTitle({ titleJa: 'ゆずをスパークリングウォーターと混ぜる', titleEn: 'Mix Yuzu 柚子 with sparkling water', originalLanguage: 'en' }),
    'Mix Yuzu 柚子 with sparkling water',
    'en-original recipe: source title is titleEn verbatim, mixed-language content preserved exactly',
  );
});

test('resolveRecipeListTranslationTitle only surfaces a translation line when the viewer language differs from originalLanguage', () => {
  const jaOriginal = { titleJa: '抹茶ラテ', titleEn: 'Matcha Latte', originalLanguage: 'ja' as const };
  assert.equal(
    resolveRecipeListTranslationTitle(jaOriginal, 'ja'),
    null,
    'viewing in the same language as the source: no secondary translation line (nothing to disambiguate)',
  );
  assert.equal(
    resolveRecipeListTranslationTitle(jaOriginal, 'en'),
    'Matcha Latte',
    'viewing in the opposite language: the translation is shown, but only as the secondary line',
  );
  assert.equal(
    resolveRecipeListTranslationTitle({ ...jaOriginal, titleEn: null }, 'en'),
    null,
    'no translation yet: no secondary line rather than falling back to the source text a second time',
  );
});

test('Manager recipe list overlays the current content translation used by Staff Recipes', () => {
  const recipe = {
    recipeId: 'recipe-1', tenantId: 'tenant-1', locationId: 'location-1', recipeCategoryId: null,
    titleJa: '抹茶ラテ', titleEn: null, descriptionJa: null, descriptionEn: null,
    contentKind: 'recipe' as const, isPopular: true, status: 'published',
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', mediaPath: null,
    originalLanguage: 'ja' as const,
  };
  const translation: ContentTranslation = {
    translationId: 'translation-1', tenantId: 'tenant-1', sourceEntityType: 'workforce_recipe',
    sourceEntityId: 'recipe-1', sourceField: 'title', sourceLanguage: 'ja', targetLanguage: 'en',
    translatedText: 'Matcha Latte', status: 'reviewed', provider: 'manual',
    sourceContentHash: hashSourceText('抹茶ラテ'), machineGenerated: false,
    reviewedAt: '2026-01-01T00:00:00Z', translatedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  };

  const [resolved] = withResolvedRecipeListTitles([recipe], [translation]);
  assert.ok(resolved);
  assert.equal(resolveRecipeListTitle(resolved, 'en'), 'Matcha Latte');
  assert.equal(resolveRecipeListTitle(resolved, 'ja'), '抹茶ラテ');

  const [stale] = withResolvedRecipeListTitles(
    [{ ...recipe, titleJa: '抹茶ラテ（アイス）' }],
    [translation],
  );
  assert.ok(stale);
  assert.equal(resolveRecipeListTitle(stale, 'en'), '抹茶ラテ（アイス）');
});

test('Manager recipe list overlays the current translation for an en-original recipe too, not just ja-original', () => {
  // An en-original recipe whose human title changed after an original-language
  // flip: `titleJa` is left over from when this recipe was ja-original and must
  // not be shown once a current ja translation of the new en source exists.
  const recipe = {
    recipeId: 'recipe-2', tenantId: 'tenant-1', locationId: 'location-1', recipeCategoryId: null,
    titleJa: 'Stale Japanese Title', titleEn: 'New English Source', descriptionJa: null, descriptionEn: null,
    contentKind: 'recipe' as const, isPopular: false, status: 'published',
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', mediaPath: null,
    originalLanguage: 'en' as const,
  };
  const translation: ContentTranslation = {
    translationId: 'translation-2', tenantId: 'tenant-1', sourceEntityType: 'workforce_recipe',
    sourceEntityId: 'recipe-2', sourceField: 'title', sourceLanguage: 'en', targetLanguage: 'ja',
    translatedText: '新しい日本語訳', status: 'machine', provider: 'machine',
    sourceContentHash: hashSourceText('New English Source'), machineGenerated: true,
    reviewedAt: null, translatedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  };

  const [resolved] = withResolvedRecipeListTitles([recipe], [translation]);
  assert.ok(resolved);
  assert.equal(resolveRecipeListTitle(resolved, 'en'), 'New English Source');
  assert.equal(resolveRecipeListTitle(resolved, 'ja'), '新しい日本語訳');
});
