import type { SupabaseClient } from '@supabase/supabase-js';
import type { TenantContext } from '@line-os/db/types';
import { PermissionError, type PermissionKey } from './permissions.js';

/**
 * Tenant context is derived from the AUTHENTICATED USER'S MEMBERSHIP — never
 * from the request body. The backend resolves which tenant a user may act in
 * and the permissions they hold there, then enforces every check against it.
 */

/**
 * Resolve the tenant context for an authenticated user within a tenant.
 *
 * `db` should be a service-role client (server only). We still verify the
 * membership row exists and is active; we do NOT trust a tenant_id supplied by
 * the client without this check.
 */
export async function resolveTenantContext(
  db: SupabaseClient,
  params: { userId: string; tenantId: string; locationId?: string },
): Promise<TenantContext> {
  const { userId, tenantId, locationId } = params;

  const { data: user } = await db
    .schema('core')
    .from('users')
    .select('is_platform_staff')
    .eq('id', userId)
    .maybeSingle();

  const isPlatformStaff = Boolean(user?.is_platform_staff);

  if (!isPlatformStaff) {
    const { data: membership, error } = await db
      .schema('core')
      .from('tenant_memberships')
      .select('id, status')
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle();

    if (error) throw error;
    if (!membership) {
      throw new PermissionError(`user ${userId} is not an active member of tenant ${tenantId}`);
    }
  }

  const permissions = await loadPermissions(db, { userId, tenantId, locationId });

  return { tenantId, userId, locationId, permissions, isPlatformStaff };
}

async function loadPermissions(
  db: SupabaseClient,
  params: { userId: string; tenantId: string; locationId?: string },
): Promise<string[]> {
  const { userId, tenantId, locationId } = params;
  const { data, error } = await db
    .schema('core')
    .from('role_assignments')
    .select('location_id, role:roles!inner(role_permissions(permission_key))')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId);

  if (error) throw error;

  const perms = new Set<string>();
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const assignmentLocation = row.location_id as string | null;
    // Tenant-wide assignment (null) always applies; location-scoped applies
    // only when it matches the active location.
    if (assignmentLocation && locationId && assignmentLocation !== locationId) continue;
    const role = row.role as { role_permissions?: Array<{ permission_key: string }> } | undefined;
    for (const rp of role?.role_permissions ?? []) perms.add(rp.permission_key);
  }
  return [...perms];
}

export function can(ctx: TenantContext, permission: PermissionKey | string): boolean {
  return ctx.isPlatformStaff || ctx.permissions.includes(permission);
}

export function requirePermission(ctx: TenantContext, permission: PermissionKey | string): void {
  if (!can(ctx, permission)) throw new PermissionError(permission);
}
