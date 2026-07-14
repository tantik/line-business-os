import type { SupabaseClient } from '@supabase/supabase-js';
import { listTenantModules, type TenantModule } from '@/lib/tenant/modules';
import { PREVIEW_MODULE } from './constants';

/**
 * Pure module-entitlement check, no I/O. Disabled or missing rows both fail
 * closed to `false` - there is no distinction between "row exists but
 * disabled" and "row does not exist" at this layer (architecture plan
 * Section W4).
 */
export function isModuleEnabled(
  modules: TenantModule[],
  tenantId: string,
  moduleName: string = PREVIEW_MODULE,
): boolean {
  return modules.some((m) => m.tenantId === tenantId && m.module === moduleName && m.isEnabled);
}

export type PreviewModuleResult =
  | { status: 'enabled' }
  | { status: 'disabled' }
  | { status: 'config_error'; message: string }
  | { status: 'unexpected_error'; message: string };

/**
 * Re-check Workforce entitlement fresh against `api.my_tenant_modules` for
 * the already-resolved preview tenant. Never trusts a client-supplied flag -
 * always reads live from the database, scoped to the resolved tenant id.
 */
export async function resolvePreviewWorkforceModule(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<PreviewModuleResult> {
  const modulesResult = await listTenantModules(supabase);
  if (modulesResult.status === 'config_error') return modulesResult;
  if (modulesResult.status !== 'success') return { status: 'unexpected_error', message: 'Unable to read module entitlements.' };
  return isModuleEnabled(modulesResult.data, tenantId) ? { status: 'enabled' } : { status: 'disabled' };
}
