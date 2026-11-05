import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashSourceText, type ContentTranslation } from '../content/translations.js';
import type { ContentTranslationProvider, TranslateBatchInput } from '../content/translation-provider.js';
import {
  ITEM_NAME_BACKFILL_LIMIT,
  buildInventoryNameTranslations,
  createItemNameCooldown,
  hashItemNameLikeDb,
  runItemNameTranslation,
  selectItemsNeedingNameTranslation,
} from './item-name-translation.js';

function translation(overrides: Partial<ContentTranslation> & Pick<ContentTranslation, 'sourceEntityId'>): ContentTranslation {
  return {
    translationId: `t-${overrides.sourceEntityId}`,
    tenantId: 'tenant-a',
    sourceEntityType: 'inventory_item',
    sourceField: 'name',
    sourceLanguage: 'ja',
    targetLanguage: 'en',
    translatedText: 'Milk',
    status: 'machine',
    provider: 'google',
    sourceContentHash: hashSourceText('牛乳'),
    machineGenerated: true,
    reviewedAt: null,
    translatedAt: '2026-11-03T00:00:00Z',
    updatedAt: '2026-11-03T00:00:00Z',
    ...overrides,
  };
}

function recordingProvider(calls: TranslateBatchInput[]): ContentTranslationProvider {
  return {
    providerId: 'fake',
    translateBatch: async (input) => {
      calls.push(input);
      return { ok: true, translations: input.texts.map((t) => `${input.targetLang}:${t}`) };
    },
  };
}

test('buildInventoryNameTranslations: keeps current translations into the other language only', () => {
  const items = [
    { itemId: 'i1', name: '牛乳' },
    { itemId: 'i2', name: '豆乳' }, // renamed since its translation was made
    { itemId: 'i3', name: 'Oat milk' },
  ];
  const map = buildInventoryNameTranslations(items, [
    translation({ sourceEntityId: 'i1' }),
    translation({ sourceEntityId: 'i2', sourceContentHash: hashSourceText('牛乳'), translatedText: 'Milk' }),
    translation({ sourceEntityId: 'i3', sourceLanguage: 'en', targetLanguage: 'ja', translatedText: 'オーツミルク', sourceContentHash: hashSourceText('Oat milk') }),
    // wrong direction for an en item (left over from before a rename to English)
    translation({ sourceEntityId: 'i3', targetLanguage: 'en', translatedText: 'x', sourceContentHash: hashSourceText('Oat milk') }),
    // not an item-name row
    translation({ sourceEntityId: 'i1', sourceEntityType: 'workforce_recipe', sourceField: 'title', translatedText: 'Recipe' }),
    // unknown item (other location / deleted)
    translation({ sourceEntityId: 'i9' }),
  ]);
  assert.deepEqual(map, { i1: { en: 'Milk' }, i3: { ja: 'オーツミルク' } });
});

test('buildInventoryNameTranslations: failed and explicitly stale rows are never shown', () => {
  const items = [{ itemId: 'i1', name: '牛乳' }];
  assert.deepEqual(buildInventoryNameTranslations(items, [translation({ sourceEntityId: 'i1', status: 'stale' })]), {});
  assert.deepEqual(buildInventoryNameTranslations(items, [translation({ sourceEntityId: 'i1', status: 'failed' })]), {});
});

test('selectItemsNeedingNameTranslation: missing or stale, active only, reviewed never, capped', () => {
  const items = [
    { itemId: 'current', name: '牛乳', isActive: true },
    { itemId: 'missing', name: '氷', isActive: true },
    { itemId: 'renamed', name: '豆乳', isActive: true },
    { itemId: 'inactive', name: '砂糖', isActive: false },
    { itemId: 'reviewed', name: '塩', isActive: true },
  ];
  const picked = selectItemsNeedingNameTranslation(items, [
    translation({ sourceEntityId: 'current' }),
    translation({ sourceEntityId: 'renamed' }),
    translation({ sourceEntityId: 'reviewed', status: 'reviewed', sourceContentHash: hashSourceText('old') }),
  ]);
  assert.deepEqual(picked.map((i) => i.itemId), ['missing', 'renamed']);

  const many = Array.from({ length: 30 }, (_, n) => ({ itemId: `n${n}`, name: `品${n}` }));
  assert.equal(selectItemsNeedingNameTranslation(many, []).length, ITEM_NAME_BACKFILL_LIMIT);
  assert.equal(ITEM_NAME_BACKFILL_LIMIT, 20);
});

test('runItemNameTranslation: one batch per direction, inventory_item/name refs, server-side hash', async () => {
  const calls: TranslateBatchInput[] = [];
  const run = await runItemNameTranslation(
    [
      { itemId: 'i1', name: '牛乳' },
      { itemId: 'i2', name: 'Oat milk', nameLanguage: 'en' },
      { itemId: 'i3', name: '氷' },
    ],
    [],
    recordingProvider(calls),
    { domainHint: 'cafe' },
  );
  assert.deepEqual(
    calls.map((c) => ({ texts: c.texts, sourceLang: c.sourceLang, targetLang: c.targetLang, domainHint: c.domainHint })),
    [
      { texts: ['牛乳', '氷'], sourceLang: 'ja', targetLang: 'en', domainHint: 'cafe' },
      { texts: ['Oat milk'], sourceLang: 'en', targetLang: 'ja', domainHint: 'cafe' },
    ],
  );
  assert.deepEqual(run.errors, []);
  assert.deepEqual(run.accepted, [
    { sourceEntityType: 'inventory_item', sourceEntityId: 'i1', sourceField: 'name', translatedText: 'en:牛乳', sourceContentHash: hashSourceText('牛乳') },
    { sourceEntityType: 'inventory_item', sourceEntityId: 'i3', sourceField: 'name', translatedText: 'en:氷', sourceContentHash: hashSourceText('氷') },
    { sourceEntityType: 'inventory_item', sourceEntityId: 'i2', sourceField: 'name', translatedText: 'ja:Oat milk', sourceContentHash: hashSourceText('Oat milk') },
  ]);
});

test('runItemNameTranslation: a current translation costs no provider call; provider errors are returned, not thrown', async () => {
  const calls: TranslateBatchInput[] = [];
  const none = await runItemNameTranslation([{ itemId: 'i1', name: '牛乳' }], [translation({ sourceEntityId: 'i1' })], recordingProvider(calls));
  assert.equal(calls.length, 0);
  assert.deepEqual(none.accepted, []);

  const failing: ContentTranslationProvider = {
    providerId: 'fake',
    translateBatch: async () => ({ ok: false, error: { code: 'translation_provider_unavailable' } }),
  };
  const failed = await runItemNameTranslation([{ itemId: 'i1', name: '牛乳' }], [], failing);
  assert.deepEqual(failed, { accepted: [], errors: [{ code: 'translation_provider_unavailable' }], failedItemIds: ['i1'] });
});

test('runItemNameTranslation: an empty provider result is never accepted (reported as failed instead)', async () => {
  const blank: ContentTranslationProvider = {
    providerId: 'fake',
    translateBatch: async (input) => ({ ok: true, translations: input.texts.map((t) => (t === '牛乳' ? '  ' : `en:${t}`)) }),
  };
  const run = await runItemNameTranslation([{ itemId: 'i1', name: '牛乳' }, { itemId: 'i2', name: '氷' }], [], blank);
  assert.deepEqual(run.accepted.map((a) => a.sourceEntityId), ['i2']);
  assert.deepEqual(run.failedItemIds, ['i1']);
});

test('failed row for the SAME name is skipped; a failed row for an older name is retried; reviewed never', async () => {
  const items = [
    { itemId: 'same', name: '牛乳' },
    { itemId: 'renamed', name: '豆乳' },
    { itemId: 'reviewed', name: '塩' },
  ];
  const rows = [
    translation({ sourceEntityId: 'same', status: 'failed' }),
    translation({ sourceEntityId: 'renamed', status: 'failed' }),
    translation({ sourceEntityId: 'reviewed', status: 'reviewed', sourceContentHash: hashSourceText('old') }),
  ];
  assert.deepEqual(selectItemsNeedingNameTranslation(items, rows).map((i) => i.itemId), ['renamed']);
  const calls: TranslateBatchInput[] = [];
  await runItemNameTranslation(items, rows, recordingProvider(calls));
  assert.deepEqual(calls.map((c) => c.texts), [['豆乳']]);
});

test('hashItemNameLikeDb mirrors SQL btrim: only ASCII spaces are trimmed', () => {
  assert.equal(hashItemNameLikeDb('  牛乳 '), hashSourceText('牛乳'));
  // JS trim() would also strip U+3000 / tab; the DB keeps them, so must we.
  assert.notEqual(hashItemNameLikeDb('牛乳　'), hashSourceText('牛乳'));
  const items = [{ itemId: 'i1', name: '牛乳　' }];
  const stored = translation({ sourceEntityId: 'i1', sourceContentHash: hashItemNameLikeDb('牛乳　') });
  assert.deepEqual(buildInventoryNameTranslations(items, [stored]), { i1: { en: 'Milk' } });
  assert.deepEqual(selectItemsNeedingNameTranslation(items, [stored]), []);
});

test('createItemNameCooldown: blocks for the ttl, per tenant+item+name, then expires', () => {
  let now = 1_000;
  const cooldown = createItemNameCooldown(30 * 60 * 1000, () => now);
  assert.equal(cooldown.isCooling('t1', 'i1', '牛乳'), false);
  cooldown.mark('t1', 'i1', '牛乳');
  assert.equal(cooldown.isCooling('t1', 'i1', '牛乳'), true);
  assert.equal(cooldown.isCooling('t2', 'i1', '牛乳'), false, 'other tenant unaffected');
  assert.equal(cooldown.isCooling('t1', 'i1', '豆乳'), false, 'a rename retries at once');
  now += 30 * 60 * 1000;
  assert.equal(cooldown.isCooling('t1', 'i1', '牛乳'), false, 'expired after 30 min');
});
