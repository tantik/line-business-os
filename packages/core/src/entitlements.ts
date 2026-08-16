import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * App-level wrapper around the Entitlements engine (migration 0069). Mirrors
 * `tenant-context.ts`'s style: `db` is a service-role client reading `core.*`
 * schemas directly (not the `api` RPC facade, which is for browser/anon-key
 * consumers per 0066's design note).
 */

export class EntitlementError extends Error {
  constructor(
    public readonly module: string,
    public readonly limitKey?: string,
  ) {
    super(
      limitKey
        ? `Entitlement limit exceeded: ${module}.${limitKey}`
        : `Module not entitled: ${module}`,
    );
    this.name = 'EntitlementError';
  }
}

/**
 * Whether the tenant may currently use a module: `is_enabled`
 * (`core.tenant_modules`) AND the tenant's plan is not suspended/canceled
 * (`core.tenant_plans`). Fails closed (`false`) if either row is missing.
 */
export async function hasModuleAccess(
  db: SupabaseClient,
  params: { tenantId: string; module: string },
): Promise<boolean> {
  const { tenantId, module } = params;

  const { data: tenantModule } = await db
    .schema('core')
    .from('tenant_modules')
    .select('is_enabled')
    .eq('tenant_id', tenantId)
    .eq('module', module)
    .maybeSingle();

  if (!tenantModule?.is_enabled) return false;

  const { data: plan } = await db
    .schema('core')
    .from('tenant_plans')
    .select('status')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  return plan !== null && plan?.status !== 'suspended' && plan?.status !== 'canceled';
}

/** Throws {@link EntitlementError} if {@link hasModuleAccess} is false. */
export async function requireModuleAccess(
  db: SupabaseClient,
  params: { tenantId: string; module: string },
): Promise<void> {
  if (!(await hasModuleAccess(db, params))) {
    throw new EntitlementError(params.module);
  }
}

/**
 * Whether `currentUsage` is still within the effective limit for
 * `(tenant, module, limitKey)` (tenant override, else plan default, else
 * unlimited). Delegates to `core.check_entitlement_limit` (0069) rather than
 * re-implementing the plan/override resolution in TypeScript.
 */
export async function checkEntitlementLimit(
  db: SupabaseClient,
  params: { tenantId: string; module: string; limitKey: string; currentUsage: number },
): Promise<boolean> {
  const { tenantId, module, limitKey, currentUsage } = params;
  const { data, error } = await db.schema('core').rpc('check_entitlement_limit', {
    p_tenant_id: tenantId,
    p_module: module,
    p_limit_key: limitKey,
    p_current_usage: currentUsage,
  });
  if (error) throw error;
  return Boolean(data);
}

/** Throws {@link EntitlementError} if {@link checkEntitlementLimit} is false. */
export async function requireEntitlementLimit(
  db: SupabaseClient,
  params: { tenantId: string; module: string; limitKey: string; currentUsage: number },
): Promise<void> {
  if (!(await checkEntitlementLimit(db, params))) {
    throw new EntitlementError(params.module, params.limitKey);
  }
}
