import type { Lang } from '@/lib/demo/cafe/i18n';

/**
 * Package vocabulary (packages model, task P5 —
 * docs/architecture/platform-packages-model.md §1, §4).
 *
 * The same module serves several industries through configuration: the
 * words a screen uses for a module come from the tenant's package, not from
 * shared module code. The Cafe words are the default; a package overrides
 * only the words that differ. Kept in code (reviewed, versioned and
 * translated with the release), keyed by `core.packages.code`.
 */

export type VocabularyKey =
  | 'module.recipes'
  | 'module.inventory'
  | 'module.purchases'
  | 'module.operations'
  | 'module.issues';

export type Vocabulary = Record<Lang, Record<VocabularyKey, string>>;
export type VocabularyOverride = Partial<Record<Lang, Partial<Record<VocabularyKey, string>>>>;

/** Default words = the Cafe package. */
export const DEFAULT_VOCABULARY: Vocabulary = {
  ja: {
    'module.recipes': 'レシピ',
    'module.inventory': '在庫',
    'module.purchases': '仕入れ',
    'module.operations': 'オペレーション',
    'module.issues': '申し送り・問題報告',
  },
  en: {
    'module.recipes': 'Recipes',
    'module.inventory': 'Inventory',
    'module.purchases': 'Purchases',
    'module.operations': 'Operations',
    'module.issues': 'Issues & Handover',
  },
};

/**
 * Per-package overrides (`core.packages.code` -> words that differ from the
 * default). Cafe uses the default words, so it has no entry. A new package
 * adds its entry here together with its `core.packages` row.
 */
export const PACKAGE_VOCABULARY: Readonly<Record<string, VocabularyOverride>> = {};

/**
 * Resolve the words for a tenant's packages. `packageCodes` is the tenant's
 * active packages in package order (`api.my_tenant_packages`, lowest
 * `sort_order` first); the first package that overrides a word wins, the
 * default fills the rest. Unknown package codes are ignored.
 */
export function resolveVocabulary(
  packageCodes: readonly string[],
  overrides: Readonly<Record<string, VocabularyOverride>> = PACKAGE_VOCABULARY,
): Vocabulary {
  const result: Vocabulary = { ja: { ...DEFAULT_VOCABULARY.ja }, en: { ...DEFAULT_VOCABULARY.en } };
  for (const lang of ['ja', 'en'] as const) {
    for (const code of [...packageCodes].reverse()) {
      Object.assign(result[lang], overrides[code]?.[lang] ?? {});
    }
  }
  return result;
}

/** Word for `key` in `lang`. */
export function vocabularyWord(vocabulary: Vocabulary, lang: Lang, key: VocabularyKey): string {
  return vocabulary[lang][key];
}
