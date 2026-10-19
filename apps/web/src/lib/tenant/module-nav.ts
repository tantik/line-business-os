/**
 * Pure helpers for module navigation (packages model, task P4).
 *
 * `api.my_tenant_navigation` (0132) returns the caller's ENABLED modules with
 * a `nav_order` (package order, then add-ons). The home screens use these
 * helpers to decide which module entry points to show and in what order.
 * Navigation only: `core.has_module_access` (RLS / RPCs) stays the security
 * boundary, so hiding a button is never the access check.
 */

export interface TenantNavRow {
  tenantId: string;
  module: string;
  navOrder: number;
}

export interface TenantNavigation {
  /** Enabled module codes of the active tenant. */
  enabled: ReadonlySet<string>;
  /** Enabled module codes of the active tenant, in navigation order. */
  order: readonly string[];
}

/** Navigation of one tenant: rows of other tenants are ignored. */
export function tenantNavigation(rows: readonly TenantNavRow[], tenantId: string): TenantNavigation {
  const own = rows
    .filter((row) => row.tenantId === tenantId)
    .slice()
    .sort((a, b) => a.navOrder - b.navOrder || a.module.localeCompare(b.module));
  const order = own.map((row) => row.module);
  return { enabled: new Set(order), order };
}

/**
 * Order entry points by their module's navigation order. Items without a
 * module (platform items such as mail or the weekly review) keep their
 * relative order and come after the module items; so do items whose module
 * is not in `order`. Stable.
 */
export function orderByModule<T extends { module?: string }>(items: readonly T[], order: readonly string[]): T[] {
  const rank = (item: T) => {
    const index = item.module === undefined ? -1 : order.indexOf(item.module);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };
  return items
    .map((item, position) => ({ item, position, rank: rank(item) }))
    .sort((a, b) => a.rank - b.rank || a.position - b.position)
    .map(({ item }) => item);
}

/** Home-screen popups that belong to a module (`?popup=` deep links). */
const POPUP_MODULE: Readonly<Record<string, string>> = {
  recipes: 'recipes',
  inventory: 'inventory',
  purchases: 'purchases',
  operations: 'operations',
  issues: 'issues',
};

/**
 * Drop a `?popup=` deep link whose module is switched off, so a stale link
 * never opens a module the tenant does not have (its button is hidden too).
 * Popups without a module (e.g. the weekly review) pass through.
 */
export function popupIfModuleEnabled<P extends string>(popup: P | null, enabled: ReadonlySet<string>): P | null {
  if (popup === null) return null;
  const module = POPUP_MODULE[popup];
  return module === undefined || enabled.has(module) ? popup : null;
}
