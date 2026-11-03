import { isTranslationStale, type ContentTranslation } from '../content/translations';
import {
  runContentTranslationBatch,
  type AcceptedTranslationField,
  type RunTranslationBatchResult,
} from '../content/translation-orchestrator';
import type { ContentTranslationProvider } from '../content/translation-provider';
import { detectNameLanguage, type InventoryNameTranslations, type ItemNameLanguage } from './item-name-display';

/**
 * Inventory item name translation -- server side, no I/O (0153). Reuses the
 * Recipes machinery unchanged: `content.translations` rows of
 * `source_entity_type = 'inventory_item'`, `source_field = 'name'`, produced
 * by `runContentTranslationBatch` (same reviewed/current/empty/limit rules)
 * and persisted by the caller via `api.set_machine_content_translation_confirmed`,
 * which derives source/target from `inventory.items.name_language` itself.
 * Imports `translations.ts` (node:crypto) -- never import this from a client
 * component; client code uses `item-name-display.ts`.
 */

export interface ItemNameSource {
  itemId: string;
  name: string;
  /** `inventory.items.name_language` when the read exposed it; else derived from the name by the same rule the DB value was set with. */
  nameLanguage?: ItemNameLanguage;
  isActive?: boolean;
}

/** Max items translated by one lazy backfill pass (one Manager page load). */
export const ITEM_NAME_BACKFILL_LIMIT = 20;

function otherLanguage(lang: ItemNameLanguage): ItemNameLanguage {
  return lang === 'ja' ? 'en' : 'ja';
}

export function itemNameLanguage(item: ItemNameSource): ItemNameLanguage {
  return item.nameLanguage ?? detectNameLanguage(item.name);
}

function isItemNameTranslation(t: ContentTranslation): boolean {
  return t.sourceEntityType === 'inventory_item' && t.sourceField === 'name';
}

/**
 * itemId -> target language -> translated name, keeping only translations
 * that are current for the item's present name (a rename makes the stored
 * source hash mismatch -> dropped, the original name shows instead) and that
 * target the language the name is NOT written in.
 */
export function buildInventoryNameTranslations(
  items: ItemNameSource[],
  translations: ContentTranslation[],
): InventoryNameTranslations {
  const itemsById = new Map(items.map((item) => [item.itemId, item]));
  const out: InventoryNameTranslations = {};
  for (const t of translations) {
    if (!isItemNameTranslation(t) || t.status === 'failed' || t.status === 'stale') continue;
    const item = itemsById.get(t.sourceEntityId);
    if (!item || t.targetLanguage !== otherLanguage(itemNameLanguage(item))) continue;
    if (isTranslationStale(t, item.name)) continue;
    (out[item.itemId] ??= {})[t.targetLanguage] = t.translatedText;
  }
  return out;
}

function existingFor(item: ItemNameSource, translations: ContentTranslation[]): ContentTranslation | null {
  const target = otherLanguage(itemNameLanguage(item));
  return (
    translations.find((t) => isItemNameTranslation(t) && t.sourceEntityId === item.itemId && t.targetLanguage === target) ?? null
  );
}

/**
 * Active items with no current translation of their name yet (missing or
 * stale), capped at `limit`. Items whose translation was reviewed by a
 * person are never picked (only a manual edit may replace those).
 */
export function selectItemsNeedingNameTranslation(
  items: ItemNameSource[],
  translations: ContentTranslation[],
  limit: number = ITEM_NAME_BACKFILL_LIMIT,
): ItemNameSource[] {
  const picked: ItemNameSource[] = [];
  for (const item of items) {
    if (picked.length >= limit) break;
    if (item.isActive === false || item.name.trim() === '') continue;
    const existing = existingFor(item, translations);
    if (existing?.status === 'reviewed') continue;
    if (existing && existing.status !== 'stale' && existing.status !== 'failed' && !isTranslationStale(existing, item.name)) continue;
    picked.push(item);
  }
  return picked;
}

export interface ItemNameTranslationRun {
  accepted: AcceptedTranslationField[];
  errors: NonNullable<RunTranslationBatchResult['error']>[];
}

/**
 * Translates the given item names: one provider batch per direction (ja->en
 * for Japanese names, en->ja for English ones -- never guessed per batch),
 * through the shared orchestrator. Returns what the caller should persist.
 */
export async function runItemNameTranslation(
  items: ItemNameSource[],
  translations: ContentTranslation[],
  provider: ContentTranslationProvider,
  options: { domainHint?: string } = {},
): Promise<ItemNameTranslationRun> {
  const accepted: AcceptedTranslationField[] = [];
  const errors: ItemNameTranslationRun['errors'] = [];
  for (const sourceLang of ['ja', 'en'] as const) {
    const group = items.filter((item) => itemNameLanguage(item) === sourceLang);
    if (group.length === 0) continue;
    const result = await runContentTranslationBatch(
      group.map((item) => ({
        sourceEntityType: 'inventory_item' as const,
        sourceEntityId: item.itemId,
        sourceField: 'name' as const,
        sourceText: item.name,
        existing: existingFor(item, translations),
      })),
      provider,
      {
        sourceLang,
        targetLang: otherLanguage(sourceLang),
        ...(options.domainHint !== undefined ? { domainHint: options.domainHint } : {}),
      },
    );
    accepted.push(...result.accepted);
    if (result.error) errors.push(result.error);
  }
  return { accepted, errors };
}
