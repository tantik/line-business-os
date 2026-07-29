import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRecipeTranslationWorkspace, flattenRecipeTranslationFields } from './recipe-translation-workspace.js';
import { hashSourceText } from './translations.js';
import type { ContentTranslation } from './translations.js';
import type { WorkforceRecipeDetail } from '@/lib/workforce/recipes';

function detail(overrides: Partial<WorkforceRecipeDetail> = {}): WorkforceRecipeDetail {
  return {
    recipe: {
      recipeId: 'recipe-1',
      tenantId: 'tenant-a',
      locationId: null,
      recipeCategoryId: null,
      titleJa: '抹茶ラテ',
      titleEn: 'Legacy Matcha Latte',
      descriptionJa: null,
      descriptionEn: null,
      contentKind: 'recipe',
      isPopular: false,
      status: 'published',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
    ingredients: [
      { ingredientId: 'ing-1', tenantId: 'tenant-a', recipeId: 'recipe-1', labelJa: '牛乳', labelEn: 'Milk', sortOrder: 1 },
    ],
    steps: [
      { stepId: 'step-1', tenantId: 'tenant-a', recipeId: 'recipe-1', stepNumber: 1, instructionJa: '混ぜる', instructionEn: 'Mix' },
    ],
    notes: [
      {
        noteId: 'note-1',
        tenantId: 'tenant-a',
        recipeId: 'recipe-1',
        titleJa: 'アレルギー',
        titleEn: 'Allergy',
        bodyJa: '乳製品を含む',
        bodyEn: 'Contains dairy',
      },
    ],
    ...overrides,
  };
}

test('buildRecipeTranslationWorkspace produces one field per translatable source field, grouped by section', () => {
  const workspace = buildRecipeTranslationWorkspace(detail(), []);
  const sectionNames = workspace.sections.map((s) => s.section);
  assert.deepEqual(sectionNames, ['title', 'description', 'ingredients', 'steps', 'notes']);

  const flat = flattenRecipeTranslationFields(workspace);
  // title(1) + description(0, null) + ingredient(1) + step(1) + note title+body(2)
  assert.equal(flat.length, 5);
});

test('a field with no matching content.translations row has existing=null and isStale=false', () => {
  const workspace = buildRecipeTranslationWorkspace(detail(), []);
  const titleField = flattenRecipeTranslationFields(workspace).find((f) => f.sourceField === 'title')!;
  assert.equal(titleField.existing, null);
  assert.equal(titleField.isStale, false);
  assert.equal(titleField.legacyEnText, 'Legacy Matcha Latte');
});

function makeTranslation(overrides: Partial<ContentTranslation>): ContentTranslation {
  return {
    translationId: 't-1',
    tenantId: 'tenant-a',
    sourceEntityType: 'workforce_recipe',
    sourceEntityId: 'recipe-1',
    sourceField: 'title',
    sourceLanguage: 'ja',
    targetLanguage: 'en',
    translatedText: 'Matcha latte',
    status: 'machine',
    provider: 'deepl',
    sourceContentHash: hashSourceText('抹茶ラテ'),
    machineGenerated: true,
    reviewedAt: null,
    translatedAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

test('a matching, current translation is attached with isStale=false', () => {
  const translation = makeTranslation({});
  const workspace = buildRecipeTranslationWorkspace(detail(), [translation]);
  const titleField = flattenRecipeTranslationFields(workspace).find((f) => f.sourceField === 'title')!;
  assert.equal(titleField.existing?.translationId, 't-1');
  assert.equal(titleField.isStale, false);
});

test('a matching translation whose hash no longer matches the current source is isStale=true', () => {
  const translation = makeTranslation({ sourceContentHash: hashSourceText('OLD JAPANESE TEXT') });
  const workspace = buildRecipeTranslationWorkspace(detail(), [translation]);
  const titleField = flattenRecipeTranslationFields(workspace).find((f) => f.sourceField === 'title')!;
  assert.equal(titleField.isStale, true);
});

test('a recipe with no description produces zero fields in the description section', () => {
  const workspace = buildRecipeTranslationWorkspace(detail({ recipe: { ...detail().recipe, descriptionJa: null } }), []);
  const descriptionSection = workspace.sections.find((s) => s.section === 'description')!;
  assert.deepEqual(descriptionSection.fields, []);
});
