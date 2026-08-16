import type { SupabaseClient } from '@supabase/supabase-js';
import { hasModuleAccess } from './entitlements.js';

/**
 * App-level wrapper around the Shared Navigation contract (migration 0071):
 * `core.module_registry`'s nav metadata (`nav_route`/`icon_key`/
 * `nav_sort_order`) combined with per-tenant module access
 * (`hasModuleAccess`, `entitlements.ts`). Not yet consumed by any shell --
 * `apps/web`'s dashboard still hard-codes its module cards (see 0071's
 * migration header for why that refactor is out of scope here).
 */

export interface NavigationEntry {
  module: string;
  name: string;
  navRoute: string;
  iconKey: string | null;
  sortOrder: number;
  enabled: boolean;
}

interface ModuleRegistryNavRow {
  module: string;
  name: string;
  nav_route: string | null;
  icon_key: string | null;
  nav_sort_order: number;
}

/**
 * Ordered navigation entries for a tenant: only modules with a non-null
 * `nav_route` (i.e. an actual dashboard entry point exists), each with the
 * tenant's live `hasModuleAccess` result. Ordered by `nav_sort_order`.
 */
export async function getTenantNavigation(
  db: SupabaseClient,
  tenantId: string,
): Promise<NavigationEntry[]> {
  const { data, error } = await db
    .schema('core')
    .from('module_registry')
    .select('module, name, nav_route, icon_key, nav_sort_order')
    .not('nav_route', 'is', null)
    .order('nav_sort_order', { ascending: true });
  if (error) throw error;

  const rows = (data ?? []) as ModuleRegistryNavRow[];
  const entries = await Promise.all(
    rows.map(async (row) => ({
      module: row.module,
      name: row.name,
      navRoute: row.nav_route as string,
      iconKey: row.icon_key,
      sortOrder: row.nav_sort_order,
      enabled: await hasModuleAccess(db, { tenantId, module: row.module }),
    })),
  );
  return entries;
}
