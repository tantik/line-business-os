import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * App-level wrapper around the Shared Settings contract (migration 0071):
 * `core.tenant_settings`, a generic per-tenant/module key-value store.
 * Mirrors `tenant-context.ts`'s style: `db` is a service-role client
 * reading/writing `core.*` directly.
 */

export interface TenantSetting {
  module: string;
  settingKey: string;
  settingValue: unknown;
}

interface TenantSettingRow {
  module: string;
  setting_key: string;
  setting_value: unknown;
}

/** A single setting's value, or `null` if unset. */
export async function getTenantSetting(
  db: SupabaseClient,
  params: { tenantId: string; module: string; settingKey: string },
): Promise<unknown | null> {
  const { data, error } = await db
    .schema('core')
    .from('tenant_settings')
    .select('setting_value')
    .eq('tenant_id', params.tenantId)
    .eq('module', params.module)
    .eq('setting_key', params.settingKey)
    .maybeSingle();
  if (error) throw error;
  return (data as { setting_value: unknown } | null)?.setting_value ?? null;
}

/** All settings for a tenant, optionally narrowed to one module. */
export async function listTenantSettings(
  db: SupabaseClient,
  params: { tenantId: string; module?: string },
): Promise<TenantSetting[]> {
  let query = db
    .schema('core')
    .from('tenant_settings')
    .select('module, setting_key, setting_value')
    .eq('tenant_id', params.tenantId);
  if (params.module) query = query.eq('module', params.module);

  const { data, error } = await query;
  if (error) throw error;

  return ((data ?? []) as TenantSettingRow[]).map((row) => ({
    module: row.module,
    settingKey: row.setting_key,
    settingValue: row.setting_value,
  }));
}

/** Upsert a single setting. Requires `core.settings.manage` (enforced by RLS). */
export async function setTenantSetting(
  db: SupabaseClient,
  params: { tenantId: string; module: string; settingKey: string; settingValue: unknown },
): Promise<void> {
  const { error } = await db
    .schema('core')
    .from('tenant_settings')
    .upsert(
      {
        tenant_id: params.tenantId,
        module: params.module,
        setting_key: params.settingKey,
        setting_value: params.settingValue,
      },
      { onConflict: 'tenant_id,module,setting_key' },
    );
  if (error) throw error;
}
