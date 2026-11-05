/**
 * Inventory item name translation -- display side (0153). Pure and
 * client-safe: no Supabase, no `node:crypto`, so client components can call
 * it directly. Staleness is decided server-side BEFORE a translation enters
 * an `InventoryNameTranslations` map (see `item-name-translation.ts`), so
 * everything in the map is current for the item's present name.
 */

export type ItemNameLanguage = 'ja' | 'en';

/**
 * Hiragana, katakana (incl. ー), CJK ext A + unified ideographs, 々 and
 * half-width katakana. MUST stay identical to the backfill predicate in
 * supabase/migrations/0153_inventory_item_name_translation.sql.
 */
const JAPANESE_SCRIPT = /[぀-ヿ㐀-䶿一-鿿々ｦ-ﾟ]/;

/** The language an item name was written in: any kana/kanji -> 'ja', else 'en' (e.g. "Milk", "Oat milk 1L"). */
export function detectNameLanguage(name: string): ItemNameLanguage {
  return JAPANESE_SCRIPT.test(name) ? 'ja' : 'en';
}

/** Current machine/reviewed translations of item names: itemId -> target language -> translated name. */
export type InventoryNameTranslations = Record<string, Partial<Record<ItemNameLanguage, string>>>;

/**
 * The ONE place that decides which name to show for an inventory item in the
 * viewer's UI language: a current translation into `lang` if there is one,
 * otherwise the original name exactly as the Manager typed it (never a raw
 * key, never an empty string).
 */
export function displayItemName(
  item: { itemId: string; name: string },
  lang: ItemNameLanguage,
  translations: InventoryNameTranslations | null | undefined,
): string {
  const translated = translations?.[item.itemId]?.[lang];
  if (!translated || translated.trim() === '') return item.name;
  // Providers return single words lower-case ("milk", "ice") but phrases
  // capitalised ("Almond milk"); a list mixing both looks broken. English
  // names are shown sentence-case: only a leading a-z is upper-cased.
  return lang === 'en' ? translated.replace(/^[a-z]/, (c) => c.toUpperCase()) : translated;
}
