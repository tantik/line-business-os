import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import type { TenantAccessResult } from './types';

/** Flat row shape returned by `api.my_tenant_modules`. */
interface ApiTenantModuleRow {
  tenant_id: string;
  module: string;
  is_enabled: boolean;
}

export interface TenantModule {
  tenantId: string;
  module: string;
  isEnabled: boolean;
}

function mapPostgrestError(error: PostgrestError): TenantAccessResult<never> {
  // 42501 = insufficient_privilege; PostgREST also surfaces "permission denied".
  if (error.code === '42501' || /permission denied/i.test(error.message)) {
    return { status: 'unauthorized', message: 'Not permitted to read tenant modules.' };
  }
  return { status: 'unexpected_error', message: error.message };
}

function compareTenantModules(a: TenantModule, b: TenantModule): number {
  const byTenant = a.tenantId.localeCompare(b.tenantId);
  if (byTenant !== 0) return byTenant;

  return a.module.localeCompare(b.module);
}

/**
 * Read current-user tenant modules through the app-facing API facade.
 *
 * The view is already self-scoped to the authenticated user's active tenant
 * memberships. This helper accepts no tenant id and adds no client-side tenant
 * filter; tenant isolation remains in the database.
 */
export async function listTenantModules(
  supabase: SupabaseClient,
): Promise<TenantAccessResult<TenantModule[]>> {
  try {
    const { data, error } = await supabase
      .schema('api')
      .from('my_tenant_modules')
      .select('tenant_id, module, is_enabled');

    if (error) return mapPostgrestError(error);

    const rows = (data ?? []) as ApiTenantModuleRow[];
    const modules = rows.map((row) => ({
      tenantId: row.tenant_id,
      module: row.module,
      isEnabled: row.is_enabled,
    }));

    modules.sort(compareTenantModules);
    return { status: 'success', data: modules };
  } catch (err) {
    return {
      status: 'unexpected_error',
      message: err instanceof Error ? err.message : 'Unexpected error reading tenant modules.',
    };
  }
}
