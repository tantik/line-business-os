import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * App-level wrapper around the Module Registry (migration 0070). Mirrors
 * `tenant-context.ts`/`entitlements.ts`'s style: `db` is a service-role
 * client reading `core.*` schemas directly.
 */

export interface ModuleRegistryEntry {
  module: string;
  name: string;
  description: string | null;
  version: string;
  lifecycleStatus: string;
  minPlanCode: string | null;
}

interface ModuleRegistryRow {
  module: string;
  name: string;
  description: string | null;
  version: string;
  lifecycle_status: string;
  min_plan_code: string | null;
}

/** Full module metadata catalog (all lifecycle statuses, unfiltered). */
export async function getModuleRegistry(db: SupabaseClient): Promise<ModuleRegistryEntry[]> {
  const { data, error } = await db
    .schema('core')
    .from('module_registry')
    .select('module, name, description, version, lifecycle_status, min_plan_code');
  if (error) throw error;

  return ((data ?? []) as ModuleRegistryRow[]).map((row) => ({
    module: row.module,
    name: row.name,
    description: row.description,
    version: row.version,
    lifecycleStatus: row.lifecycle_status,
    minPlanCode: row.min_plan_code,
  }));
}

/**
 * Whether a tenant COULD enable `module`: lifecycle status is not
 * deprecated/retired, the tenant's plan matches the module's required plan
 * (if any), and every direct dependency is already enabled for the tenant.
 * Does not check whether the module IS currently enabled -- see
 * `hasModuleAccess` (`entitlements.ts`) for that.
 */
export async function canEnableModule(
  db: SupabaseClient,
  params: { tenantId: string; module: string },
): Promise<boolean> {
  const { data, error } = await db.schema('core').rpc('can_enable_module', {
    p_tenant_id: params.tenantId,
    p_module: params.module,
  });
  if (error) throw error;
  return Boolean(data);
}
