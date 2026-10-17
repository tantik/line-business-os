import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveFieldDisplay } from '@/lib/content/recipe-display';

const SOURCE = readFileSync(new URL('./recipes-popup.tsx', import.meta.url), 'utf8');

test('QA3 12.7: the opened recipe dialog title follows the viewer language, like the detail body', () => {
  assert.match(SOURCE, /const detailTitleField = detail \? titleFieldByRecipeId\[detail\.recipe\.recipeId\] : undefined;/);
  assert.match(SOURCE, /resolveFieldDisplay\(detailTitleField, lang\)\.text/);
  // The resolution itself: EN viewer of a JA-original recipe with a machine translation.
  const shown = resolveFieldDisplay(
    {
      originalLanguage: 'ja',
      sourceText: 'カフェラテ',
      existing: { translatedText: 'Cafe Latte', status: 'machine' },
      isStale: false,
      legacyOtherLanguageText: null,
    } as unknown as Parameters<typeof resolveFieldDisplay>[0],
    'en',
  );
  assert.equal(shown.text, 'Cafe Latte');
});

test('QA3 (2026-10-17): HACCP numeric answer has an accessible name; schedule header marker no longer overlays the weekday', () => {
  const task = readFileSync(new URL('../operations/task-detail-modal.tsx', import.meta.url), 'utf8');
  assert.match(task, /aria-label=\{item\.numericUnit \? `\$\{item\.label\} \(\$\{item\.numericUnit\}\)` : item\.label\}/);
  const manager = readFileSync(new URL('../manager/manager-dashboard-client.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(manager, /style=\{\{ \.\.\.understaffedMarkerStyle, position: 'absolute', top: 0, right: 0 \}\}/);
  assert.match(manager, /style=\{understaffedHeaderMarkerStyle\}/);
});
