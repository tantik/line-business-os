/**
 * Pure decision logic for the tenant (Owner) invitation flow (Stage 4B-3,
 * DEBT-110 a/b). No I/O -- unit-tested in `tenant-invite-decision.test.ts`;
 * the callback route, the set-password action and the in-app banner only
 * wire these to Supabase calls.
 */

export interface PendingTenantInvitation {
  invitationId: string;
  tenantId: string;
  tenantName: string;
  roleKey: string;
  expiresAt: string;
  isExpired: boolean;
  createdAt: string;
}

/**
 * Reasons shown on `/auth/link-invalid` for the Owner flow. They only pick a
 * help text; they grant nothing.
 *   owner          -- the email link itself is invalid / used / expired (verifyOtp failed)
 *   owner_expired  -- the link worked, but every pending invitation is past its expiry
 *   owner_none     -- the link worked, but there is no pending invitation (revoked, or already accepted)
 */
export type OwnerLinkInvalidReason = 'owner' | 'owner_expired' | 'owner_none';

export type TenantInviteCallbackDecision =
  /** Route to password setup for this invitation (session kept). */
  | { kind: 'set_password'; invitationId: string | null }
  /** Nothing to accept: sign the fresh session out again and explain. */
  | { kind: 'invalid'; reason: Exclude<OwnerLinkInvalidReason, 'owner'> };

/** Oldest acceptable (pending, not expired) invitation, or null. */
export function pickAcceptableInvitation(rows: readonly PendingTenantInvitation[]): PendingTenantInvitation | null {
  const open = rows.filter((row) => !row.isExpired);
  if (open.length === 0) return null;
  return [...open].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0] ?? null;
}

/**
 * After the invite email's token was verified (a real session exists, no
 * password yet), decide where the new Owner goes.
 *
 * A READ ERROR does not burn the link: the token is already consumed by
 * verifyOtp, so signing out would leave the person with no way back in. The
 * session is kept and the set-password step re-reads the invitations itself
 * (`invitationId: null`) -- it never grants anything without the DB's own
 * checks in `api.accept_tenant_invitation`.
 */
export function decideTenantInviteCallback(
  read: { status: 'success'; data: readonly PendingTenantInvitation[] } | { status: 'error' },
): TenantInviteCallbackDecision {
  if (read.status !== 'success') return { kind: 'set_password', invitationId: null };
  const acceptable = pickAcceptableInvitation(read.data);
  if (acceptable) return { kind: 'set_password', invitationId: acceptable.invitationId };
  if (read.data.length > 0) return { kind: 'invalid', reason: 'owner_expired' };
  return { kind: 'invalid', reason: 'owner_none' };
}

/** DB error of `api.accept_tenant_invitation` -> a fixed status (never the raw message). */
export function mapAcceptTenantInvitationError(error: { code?: string; message?: string }): 'not_acceptable' | 'unauthorized' | 'error' {
  const message = error.message ?? '';
  if (message.includes('invitation_not_acceptable')) return 'not_acceptable';
  if (error.code === '28000' || error.code === '42501' || message.includes('not_authenticated')) return 'unauthorized';
  return 'error';
}

/** In-app banner rows: open invitations to accept, plus whether any expired ones should be mentioned. */
export function partitionBannerInvitations(rows: readonly PendingTenantInvitation[]): {
  open: PendingTenantInvitation[];
  expiredCount: number;
} {
  const open = rows.filter((row) => !row.isExpired).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return { open, expiredCount: rows.length - open.length };
}
