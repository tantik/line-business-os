import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import type { TenantAccessResult } from './types';
import type { TenantNavRow } from './module-nav';

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

/** Flat row shape returned by `api.my_tenant_navigation` (0132). */
export interface ApiTenantNavigationRow {
  tenant_id: string;
  module: string;
  nav_order: number;
}

/** Rows of `api.my_tenant_navigation` (direct read or `api.my_page_context`) -> nav rows. */
export function mapTenantNavigationRows(rows: ApiTenantNavigationRow[]): TenantNavRow[] {
  return rows.map((row) => ({ tenantId: row.tenant_id, module: row.module, navOrder: Number(row.nav_order) }));
}

/**
 * Read the caller's enabled modules with their navigation order (package
 * order, then add-ons) through `api.my_tenant_navigation`. Self-scoped to the
 * caller's active memberships like `my_tenant_modules`; pass the rows to
 * `tenantNavigation()` for the active tenant. Navigation only — RLS / RPCs
 * (`core.has_module_access`) remain the authorization boundary.
 */
export async function listTenantNavigation(supabase: SupabaseClient): Promise<TenantAccessResult<TenantNavRow[]>> {
  try {
    const { data, error } = await supabase.schema('api').from('my_tenant_navigation').select('tenant_id, module, nav_order');

    if (error) return mapPostgrestError(error);

    return { status: 'success', data: mapTenantNavigationRows((data ?? []) as ApiTenantNavigationRow[]) };
  } catch (err) {
    return {
      status: 'unexpected_error',
      message: err instanceof Error ? err.message : 'Unexpected error reading tenant navigation.',
    };
  }
}

/** Flat row shape returned by `api.my_tenant_packages` (0129). */
export interface ApiTenantPackageRow {
  tenant_id: string;
  package_code: string;
  status: string;
  sort_order: number;
}

/**
 * Active package codes of one tenant in package order (lowest `sort_order`
 * first), through `api.my_tenant_packages` (RLS-scoped to the caller's
 * memberships). Feeds the package vocabulary (`resolveVocabulary`, task P5).
 * On a read failure returns an empty list, so screens fall back to the
 * default (Cafe) words.
 */
export async function listTenantPackageCodes(supabase: SupabaseClient, tenantId: string): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .schema('api')
      .from('my_tenant_packages')
      .select('tenant_id, package_code, status, sort_order')
      .eq('tenant_id', tenantId)
      .eq('status', 'active');
    if (error) return [];
    return mapTenantPackageCodes((data ?? []) as ApiTenantPackageRow[], tenantId);
  } catch {
    return [];
  }
}

/** Active package codes of one tenant from `api.my_tenant_packages` rows (direct read or `api.my_page_context`), in package order. */
export function mapTenantPackageCodes(rows: ApiTenantPackageRow[], tenantId: string): string[] {
  return rows
    .filter((row) => row.tenant_id === tenantId && row.status === 'active')
    .sort((a, b) => a.sort_order - b.sort_order || a.package_code.localeCompare(b.package_code))
    .map((row) => row.package_code);
}
