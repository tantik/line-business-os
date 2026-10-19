import type { Lang } from '@/lib/demo/cafe/i18n';

/**
 * The one food-allergen vocabulary (Cafe package configuration, task P6 --
 * docs/architecture/platform-packages-model.md §3). Replaces the separate
 * copies Inventory (`inventory-i18n.ts`) and Recipes (`recipes-i18n.ts`,
 * `lib/workforce/recipe-allergens.ts`) used to keep. Shown only when the
 * tenant's package config has `allergens: true` (`lib/packages/config.ts`).
 *
 * 29 codes (migration 0124; 消費者庁 食品表示基準 revision effective
 * 2026-04-01): 9 特定原材料 (mandatory) then 20 特定原材料に準ずるもの
 * (recommended). `recipe-allergens.test.ts` asserts this list equals both
 * arrays in migration 0124 (CHECK constraint and RPC).
 */
export const ALLERGEN_CODE_GROUPS = [
  {
    key: 'mandatory',
    codes: ['egg', 'milk', 'wheat', 'buckwheat', 'peanut', 'shrimp', 'crab', 'walnut', 'cashew'],
  },
  {
    key: 'recommended',
    codes: [
      'almond', 'abalone', 'squid', 'salmon_roe', 'orange', 'kiwi', 'beef', 'sesame', 'salmon', 'mackerel',
      'soy', 'chicken', 'banana', 'pistachio', 'pork', 'macadamia', 'peach', 'yam', 'apple', 'gelatin',
    ],
  },
] as const;

export type AllergenCodeGroup = (typeof ALLERGEN_CODE_GROUPS)[number];

/** All 29 codes in canonical display order (mandatory group, then recommended). */
export const ALLERGEN_CODES: readonly string[] = ALLERGEN_CODE_GROUPS.flatMap((group) => group.codes);

/** JA/EN display names for every code. */
export const ALLERGEN_LABELS: Record<Lang, Record<string, string>> = {
  en: {
    egg: 'Egg', milk: 'Milk', wheat: 'Wheat', buckwheat: 'Buckwheat', peanut: 'Peanut',
    shrimp: 'Shrimp', crab: 'Crab', walnut: 'Walnut',
    almond: 'Almond', abalone: 'Abalone', squid: 'Squid', salmon_roe: 'Salmon roe', orange: 'Orange',
    cashew: 'Cashew nut', kiwi: 'Kiwi fruit', beef: 'Beef', sesame: 'Sesame', salmon: 'Salmon',
    mackerel: 'Mackerel', soy: 'Soy', chicken: 'Chicken', banana: 'Banana', pistachio: 'Pistachio', pork: 'Pork',
    macadamia: 'Macadamia nut', peach: 'Peach', yam: 'Yam', apple: 'Apple', gelatin: 'Gelatin',
  },
  ja: {
    egg: '卵', milk: '乳', wheat: '小麦', buckwheat: 'そば', peanut: '落花生',
    shrimp: 'えび', crab: 'かに', walnut: 'くるみ',
    almond: 'アーモンド', abalone: 'あわび', squid: 'いか', salmon_roe: 'いくら', orange: 'オレンジ',
    cashew: 'カシューナッツ', kiwi: 'キウイフルーツ', beef: '牛肉', sesame: 'ごま', salmon: 'さけ',
    mackerel: 'さば', soy: '大豆', chicken: '鶏肉', banana: 'バナナ', pistachio: 'ピスタチオ', pork: '豚肉',
    macadamia: 'マカダミアナッツ', peach: 'もも', yam: 'やまいも', apple: 'りんご', gelatin: 'ゼラチン',
  },
};

/** Localized display name for one allergen code; falls back to the raw code for an unrecognized value (should not happen -- the DB CHECK constraint already limits this to the fixed vocabulary). */
export function allergenLabel(lang: Lang, code: string): string {
  return ALLERGEN_LABELS[lang][code] ?? code;
}

const ALLERGEN_GROUP_HEADINGS: Record<Lang, Record<AllergenCodeGroup['key'], string>> = {
  en: { mandatory: 'Mandatory allergens ({count})', recommended: 'Recommended allergens ({count})' },
  ja: { mandatory: '特定原材料（{count}品目）', recommended: '特定原材料に準ずるもの（{count}品目）' },
};

/** Subheading for one allergen group; `{count}` comes from the group's own code list, never hard-coded. */
export function allergenGroupHeading(lang: Lang, group: AllergenCodeGroup): string {
  return ALLERGEN_GROUP_HEADINGS[lang][group.key].replace('{count}', String(group.codes.length));
}

/** Kitchen disclaimer always shown under the recipe-level allergen summary. */
export const ALLERGEN_DISCLAIMER: Record<Lang, string> = {
  en: 'Prepared in a kitchen that handles other ingredients. Please ask staff about allergies. This information is based on ingredients recorded by the store, is for reference only, and does not guarantee that a dish is free of allergens.',
  ja: '同じ厨房で他の食材も扱っています。アレルギーのある方はスタッフにお尋ねください。この情報は店舗が登録した原材料に基づく参考情報であり、アレルゲンが含まれないことを保証するものではありません。',
};
