import { NextResponse } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { getWorkforceEmployeeInvitationById } from '@/lib/workforce/invitations';
import {
  buildResetMarker,
  LINK_INVALID_PATH,
  RESET_MARKER_COOKIE,
  RESET_MARKER_COOKIE_OPTIONS,
  RESET_PASSWORD_PATH,
} from '@/lib/auth/password-reset';

// DEBT-084: a dead link used to land on `/sign-in?error=1`, which told the
// user their password was wrong. It now explains the link itself is invalid.
const LINK_ERROR_URL = LINK_INVALID_PATH;

/**
 * Only these OTP types are ever legitimate for this callback -- never trust
 * an arbitrary client-supplied `type` query param verbatim.
 *
 * `'invite'` -- the Invite email template (Stage 2) produces `type=invite`.
 *
 * `'recovery'` -- added for Defect C's Manager-triggered recovery action
 * (`invite-employee`'s `action: 'recover'`, which calls
 * `auth.resetPasswordForEmail`, itself explicitly reviewed and Founder-
 * approved 2026-08-16). A recovery token proves the SAME thing an invite
 * token does for this callback's purposes -- the caller controls this
 * email address right now -- so it is handled identically below: verified,
 * then routed to the same password-setup step, never straight to an
 * authenticated page. This callback still only ever accepts a token for an
 * invitation this route itself re-validates as pending/unexpired/owned by
 * the now-authenticated caller (below) -- a recovery token alone is not
 * enough to reach password setup for someone else's invitation.
 */
const ALLOWED_TOKEN_HASH_TYPES: ReadonlySet<string> = new Set(['invite', 'recovery']);

/** `reason` only picks the help text on the invalid-link page; it grants nothing. */
function errorRedirect(origin: string, reason?: 'invite' | 'reset'): NextResponse {
  const target = new URL(LINK_ERROR_URL, origin);
  if (reason) target.searchParams.set('reason', reason);
  return NextResponse.redirect(target);
}

/**
 * Self-service "forgot password" link (`?flow=reset`, no invitation_id;
 * see lib/auth/password-reset.ts). Accepts ONLY `type=recovery` with a
 * `token_hash`, verified server-side; the resulting session may only set a
 * new password (the reset page re-checks the recovery sign-in is recent).
 */
async function passwordResetCallback(url: URL): Promise<NextResponse> {
  const tokenHash = url.searchParams.get('token_hash');
  if (!tokenHash || url.searchParams.get('type') !== 'recovery') {
    return errorRedirect(url.origin, 'reset');
  }
  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' });
  if (error || !data.user || !data.session) {
    return errorRedirect(url.origin, 'reset');
  }
  const marker = buildResetMarker(data.user.id, data.session.access_token);
  if (!marker) {
    // Fail closed: never leave a recovery session that cannot be used safely.
    await supabase.auth.signOut();
    return errorRedirect(url.origin, 'reset');
  }
  const response = NextResponse.redirect(new URL(RESET_PASSWORD_PATH, url.origin));
  response.cookies.set(RESET_MARKER_COOKIE, marker, RESET_MARKER_COOKIE_OPTIONS);
  return response;
}

/**
 * Staff invitation email callback (new-user path only -- the existing-user
 * path never sends an email; see `PendingInvitationBanner` instead).
 *
 * Two supported callback shapes, both verified entirely server-side. This
 * route never reads or handles a raw `access_token`/`refresh_token`, and
 * never runs client-side `setSession()` -- see
 * docs/ai/STAFF_ONBOARDING_INVITE_CALLBACK_DEFECT_IMPLEMENTATION_PLAN_2026-08-15.md
 * for why (Supabase's Admin API `inviteUserByEmail` does not support PKCE,
 * confirmed against the installed `@supabase/auth-js` source, so an
 * Admin-issued invite can never arrive as `?code=`; it must instead arrive
 * via a `token_hash`, which requires the Invite email template to embed
 * `{{ .TokenHash }}` -- a Supabase Auth configuration change tracked
 * separately in that plan and NOT YET APPLIED as of this commit, so this
 * branch is inert in production/Preview until that template change lands):
 *
 * 1. `?invitation_id=<id>&token_hash=<hash>&type=invite` -- the primary
 *    shape once the Invite email template is updated. Verified with
 *    `supabase.auth.verifyOtp({ token_hash, type })` via the server
 *    client, which persists the resulting session to cookies exactly like
 *    `exchangeCodeForSession` does.
 * 2. `?invitation_id=<id>&code=<pkce_code>` -- kept as a backward-compatible
 *    fallback (not currently produced by `invite-employee`, but free to
 *    keep and harmless if some future flow ever does emit PKCE).
 *
 * KNOWN SUPABASE GAP (documented in docs/ai/STAFF_AUTH_PROVISIONING_HANDOFF_2026-08-13.md
 * §3 Phase 3, GitHub #45210, unresolved upstream): both `verifyOtp` and
 * `exchangeCodeForSession` establish a REAL session before any password has
 * been set. The only available mitigation is UX-only -- route straight to
 * the password-setup screen and nowhere else. It must never redirect to
 * `/dashboard` or any other authenticated page.
 *
 * This handler additionally pre-validates (read-only) that the invitation
 * is still `pending` and visible to the now-authenticated caller (RLS:
 * `wf_employee_invitations_self_read` -- `target_user_id = auth.uid()`)
 * before routing to password setup. If verification succeeds but the
 * invitation isn't in that state (already accepted/revoked/expired, or
 * simply doesn't belong to this caller -- RLS collapses both to "not
 * found", deliberately, to avoid leaking which invitation ids exist), the
 * freshly-established session is signed out again before redirecting, so a
 * confirmed-but-not-onboarded session is never left sitting in the
 * browser. This route never accepts the invitation itself either way --
 * only `api.accept_employee_invitation` (invoked from the password-setup
 * step) is the acceptance authority, and it independently re-validates the
 * caller against `target_user_id` regardless of what this route already
 * checked.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const invitationId = url.searchParams.get('invitation_id');
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type');

  if (!invitationId) {
    if (url.searchParams.get('flow') === 'reset') {
      return passwordResetCallback(url);
    }
    return errorRedirect(url.origin);
  }

  const supabase = await createClient();

  if (tokenHash) {
    if (!type || !ALLOWED_TOKEN_HASH_TYPES.has(type)) {
      return errorRedirect(url.origin, 'invite');
    }
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as EmailOtpType });
    if (error) {
      return errorRedirect(url.origin, 'invite');
    }
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return errorRedirect(url.origin, 'invite');
    }
  } else {
    return errorRedirect(url.origin, 'invite');
  }

  // Session is now established (Auth-confirmed). Confirm this specific
  // invitation is still pending and belongs to this caller before sending
  // them to password setup -- read-only, never a write/accept.
  const invitationResult = await getWorkforceEmployeeInvitationById(supabase, invitationId);
  const invitation = invitationResult.status === 'success' ? invitationResult.data : null;
  if (!invitation || invitation.status !== 'pending' || invitation.isExpired) {
    await supabase.auth.signOut();
    return errorRedirect(url.origin, 'invite');
  }

  return NextResponse.redirect(
    new URL(`/auth/accept-invite/set-password?invitation_id=${encodeURIComponent(invitationId)}`, url.origin),
  );
}
