import { createHash } from 'node:crypto';
import type { ContentTranslation } from '../content/translations';
import {
  runContentTranslationBatch,
  type AcceptedTranslationField,
  type RunTranslationBatchResult,
} from '../content/translation-orchestrator';
import type { ContentTranslationProvider } from '../content/translation-provider';
import { detectNameLanguage, type InventoryNameTranslations, type ItemNameLanguage } from './item-name-display';

/**
 * Inventory item name translation -- server side, no I/O (0153). Reuses the
 * Recipes machinery: `content.translations` rows of
 * `source_entity_type = 'inventory_item'`, `source_field = 'name'`, produced
 * by `runContentTranslationBatch` and persisted by the caller via
 * `api.set_machine_content_translation_confirmed`, which derives
 * source/target from `inventory.items.name_language` itself.
 * Imports `node:crypto` -- never import this from a client component;
 * client code uses `item-name-display.ts`.
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

/**
 * Hash of an item name exactly as the DB computes `source_content_hash`
 * (`sha256(btrim(name))`, 0042/0058 -- `btrim` strips ASCII spaces only).
 * `hashSourceText` (`String.prototype.trim`, all Unicode whitespace) would
 * disagree for a name with an edge tab/newline/U+3000 written by another path
 * (the app's own form already trims), making that translation look stale
 * forever and re-sending it to the provider on every load. Inventory names
 * therefore compare with the DB's own rule.
 */
export function hashItemNameLikeDb(name: string): string {
  return createHash('sha256').update(name.replace(/^ +| +$/g, '')).digest('hex');
}

function isCurrentFor(t: ContentTranslation, name: string): boolean {
  return t.sourceContentHash === hashItemNameLikeDb(name);
}

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
    if (!isCurrentFor(t, item.name) || t.translatedText.trim() === '') continue;
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
 * True when this item's name must NOT go to the provider: a person reviewed
 * the translation (only a manual edit may replace it), there already is a
 * current one, or a `failed` row records that exactly this name failed.
 */
function skipTranslation(item: ItemNameSource, existing: ContentTranslation | null): boolean {
  if (item.name.trim() === '') return true;
  if (!existing) return false;
  if (existing.status === 'reviewed') return true;
  if (existing.status === 'stale') return false;
  return isCurrentFor(existing, item.name); // machine (current) or failed for this very name
}

/** Active items with no current translation of their name yet (missing or stale), capped at `limit`. */
export function selectItemsNeedingNameTranslation(
  items: ItemNameSource[],
  translations: ContentTranslation[],
  limit: number = ITEM_NAME_BACKFILL_LIMIT,
): ItemNameSource[] {
  const picked: ItemNameSource[] = [];
  for (const item of items) {
    if (picked.length >= limit) break;
    if (item.isActive === false) continue;
    if (skipTranslation(item, existingFor(item, translations))) continue;
    picked.push(item);
  }
  return picked;
}

export interface ItemNameTranslationRun {
  /** Non-empty translations to persist. */
  accepted: AcceptedTranslationField[];
  errors: NonNullable<RunTranslationBatchResult['error']>[];
  /** Items sent to the provider that produced no usable translation (provider error, empty text, over limit) -- for the caller's cooldown. */
  failedItemIds: string[];
}

/**
 * Translates the given item names: one provider batch per direction (ja->en
 * for Japanese names, en->ja for English ones -- never guessed per batch),
 * through the shared orchestrator. Whether an item still needs a call is
 * decided here with the DB's hash rule (`skipTranslation`), so the batch is
 * given `existing: null` and the orchestrator only applies its empty/limit
 * rules. An empty provider result is never returned as accepted.
 */
export async function runItemNameTranslation(
  items: ItemNameSource[],
  translations: ContentTranslation[],
  provider: ContentTranslationProvider,
  options: { domainHint?: string } = {},
): Promise<ItemNameTranslationRun> {
  const accepted: AcceptedTranslationField[] = [];
  const errors: ItemNameTranslationRun['errors'] = [];
  const failedItemIds: string[] = [];
  const pending = items.filter((item) => !skipTranslation(item, existingFor(item, translations)));
  for (const sourceLang of ['ja', 'en'] as const) {
    const group = pending.filter((item) => itemNameLanguage(item) === sourceLang);
    if (group.length === 0) continue;
    const result = await runContentTranslationBatch(
      group.map((item) => ({
        sourceEntityType: 'inventory_item' as const,
        sourceEntityId: item.itemId,
        sourceField: 'name' as const,
        sourceText: item.name,
        existing: null,
      })),
      provider,
      {
        sourceLang,
        targetLang: otherLanguage(sourceLang),
        ...(options.domainHint !== undefined ? { domainHint: options.domainHint } : {}),
      },
    );
    if (result.error) errors.push(result.error);
    const usable = new Set<string>();
    for (const field of result.accepted) {
      if (field.translatedText.trim() === '') continue;
      accepted.push(field);
      usable.add(field.sourceEntityId);
    }
    for (const item of group) if (!usable.has(item.itemId)) failedItemIds.push(item.itemId);
  }
  return { accepted, errors, failedItemIds };
}

/**
 * Per-server-instance negative cache: an item whose translation just failed
 * is not retried for `ttlMs` (default 30 min), so a failing provider is not
 * re-billed on every dashboard refresh. In memory only -- a cold start
 * forgets it, which is acceptable (at most one retry per instance). Keyed
 * by the name too: renaming an item retries it at once.
 */
export function createItemNameCooldown(ttlMs: number = 30 * 60 * 1000, now: () => number = Date.now) {
  const until = new Map<string, number>();
  const key = (tenantId: string, itemId: string, name: string) => `${tenantId}\u0000${itemId}\u0000${name}`;
  return {
    isCooling(tenantId: string, itemId: string, name: string): boolean {
      const k = key(tenantId, itemId, name);
      const t = until.get(k);
      if (t === undefined) return false;
      if (t <= now()) {
        until.delete(k);
        return false;
      }
      return true;
    },
    mark(tenantId: string, itemId: string, name: string): void {
      until.set(key(tenantId, itemId, name), now() + ttlMs);
      if (until.size > 5000) {
        const t = now();
        for (const [k, v] of until) if (v <= t) until.delete(k);
      }
    },
  };
}
