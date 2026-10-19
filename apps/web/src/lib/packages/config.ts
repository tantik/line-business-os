/**
 * Package configuration (packages model, task P6 --
 * docs/architecture/platform-packages-model.md §3, §4).
 *
 * Industry-specific decisions live here, keyed by `core.packages.code`,
 * never in shared module code: a shared module reads the resolved config
 * and stays neutral on its own. Kept in code (reviewed and versioned with
 * the release), like the package vocabulary (`vocabulary.ts`).
 *
 * Pure (no imports, no I/O) so it can be unit-tested and used by server
 * pages, Server Actions and scripts alike. Server code loads a tenant's
 * config with `loadTenantPackageConfig` (`tenant-package-config.ts`).
 */

export interface PackageConfig {
  /**
   * Food-allergen information (29-code 特定原材料等 vocabulary,
   * `lib/packages/cafe/allergens.ts`): the Inventory item form's allergen
   * block and the recipe detail allergen summary / per-ingredient tags.
   */
  allergens: boolean;
  /**
   * First line of the machine-translation system prompt (OpenAI provider):
   * tells the model what kind of text it translates and for whom.
   */
  translationDomainHint: string;
}

/** Neutral defaults: what a package gets for every field it does not set. */
export const DEFAULT_PACKAGE_CONFIG: Readonly<PackageConfig> = {
  allergens: false,
  translationDomainHint:
    'You translate short Japanese business text fields (procedures, instructions, and notes) into clear, natural English for a small-business staff app.',
};

/**
 * Per-package settings (`core.packages.code` -> fields that differ from the
 * default). A new package adds its entry here together with its
 * `core.packages` row.
 */
export const PACKAGE_CONFIG: Readonly<Record<string, Partial<PackageConfig>>> = {
  cafe: {
    allergens: true,
    // Byte-identical to the pre-P6 hard-coded first line of the OpenAI
    // system prompt (asserted in `openai-provider.test.ts`).
    translationDomainHint:
      'You translate short Japanese food/beverage-recipe text fields into clear, natural English for a cafe staff app.',
  },
};

/**
 * Package used when the tenant's package list is EMPTY -- a failed read of
 * `api.my_tenant_packages` (`listTenantPackageCodes` returns `[]` on error)
 * or a tenant that holds no package yet. Deliberate decision (P6): fail
 * toward today's behaviour. Every tenant is a Cafe tenant today, and a
 * transient read failure must never hide allergen information from a cafe
 * or change its translation prompt. Revisit once a second package exists
 * and every tenant is guaranteed to hold a package.
 */
export const EMPTY_PACKAGES_FALLBACK: readonly string[] = ['cafe'];

/**
 * Resolve the config for a tenant's packages. `packageCodes` is the
 * tenant's active packages in package order (lowest `sort_order` first);
 * the first package that defines a field wins, the default fills the rest.
 * Unknown package codes contribute nothing (-> neutral default). An empty
 * list resolves as `EMPTY_PACKAGES_FALLBACK` (see above).
 */
export function resolvePackageConfig(
  packageCodes: readonly string[],
  overrides: Readonly<Record<string, Partial<PackageConfig>>> = PACKAGE_CONFIG,
): PackageConfig {
  const codes = packageCodes.length > 0 ? packageCodes : EMPTY_PACKAGES_FALLBACK;
  const result: PackageConfig = { ...DEFAULT_PACKAGE_CONFIG };
  for (const key of Object.keys(DEFAULT_PACKAGE_CONFIG) as (keyof PackageConfig)[]) {
    for (const code of codes) {
      const value = overrides[code]?.[key];
      if (value !== undefined) {
        (result as unknown as Record<keyof PackageConfig, unknown>)[key] = value;
        break;
      }
    }
  }
  return result;
}
