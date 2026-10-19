import type { SupabaseClient } from '@supabase/supabase-js';
import { listTenantPackageCodes } from '../tenant/modules';
import { resolvePackageConfig, type PackageConfig } from './config';

/**
 * Server-side: the resolved package config of one tenant (task P6). Reads
 * the tenant's active packages through RLS (`api.my_tenant_packages`); a
 * read failure yields `[]`, which `resolvePackageConfig` resolves as the
 * Cafe package (see `EMPTY_PACKAGES_FALLBACK`). Pages that already hold the
 * package codes call `resolvePackageConfig(packageCodes)` directly instead.
 */
export async function loadTenantPackageConfig(supabase: SupabaseClient, tenantId: string): Promise<PackageConfig> {
  return resolvePackageConfig(await listTenantPackageCodes(supabase, tenantId));
}
