import type { SupabaseClient } from '@supabase/supabase-js';
import { mapAcceptTenantInvitationError, type PendingTenantInvitation } from './tenant-invite-decision';

/** Row of `api.my_pending_tenant_invitations()` (0134). */
interface ApiPendingTenantInvitationRow {
  invitation_id: string;
  tenant_id: string;
  tenant_name: string;
  role_key: string;
  location_id: string | null;
  expires_at: string;
  is_expired: boolean;
  created_at: string;
}

export type PendingTenantInvitationsResult = { status: 'success'; data: PendingTenantInvitation[] } | { status: 'error' };

/**
 * The caller's OWN pending tenant invitations (Owner now, Manager later),
 * scoped in SQL by `core.current_user_id()` -- never by an argument. Includes
 * expired rows (`isExpired`) so the screens can say "expired" instead of
 * "nothing". Request-scoped anon-key client only.
 */
export async function listMyPendingTenantInvitations(supabase: SupabaseClient): Promise<PendingTenantInvitationsResult> {
  try {
    const { data, error } = await supabase.schema('api').rpc('my_pending_tenant_invitations');
    if (error) return { status: 'error' };
    const rows = (Array.isArray(data) ? data : []) as ApiPendingTenantInvitationRow[];
    return {
      status: 'success',
      data: rows.map((row) => ({
        invitationId: row.invitation_id,
        tenantId: row.tenant_id,
        tenantName: row.tenant_name,
        roleKey: row.role_key,
        expiresAt: row.expires_at,
        isExpired: row.is_expired === true,
        createdAt: row.created_at,
      })),
    };
  } catch {
    return { status: 'error' };
  }
}

export type AcceptTenantInvitationResult =
  | { status: 'success'; tenantId: string; roleKey: string }
  | { status: 'not_acceptable' | 'unauthorized' | 'error' };

/**
 * Accept one invitation as the signed-in target user (`api.accept_tenant_invitation`,
 * 0134). The DB re-checks everything (target = caller's JWT, pending,
 * unexpired, active tenant) and is idempotent; a foreign or unknown id is
 * indistinguishable from an expired one (`not_acceptable`).
 */
export async function acceptTenantInvitation(supabase: SupabaseClient, invitationId: string): Promise<AcceptTenantInvitationResult> {
  try {
    const { data, error } = await supabase.schema('api').rpc('accept_tenant_invitation', { p_invitation_id: invitationId });
    if (error) return { status: mapAcceptTenantInvitationError(error) };
    const row = data as { tenant_id?: unknown; role_key?: unknown } | null;
    if (!row || typeof row.tenant_id !== 'string') return { status: 'error' };
    return { status: 'success', tenantId: row.tenant_id, roleKey: typeof row.role_key === 'string' ? row.role_key : '' };
  } catch {
    return { status: 'error' };
  }
}
