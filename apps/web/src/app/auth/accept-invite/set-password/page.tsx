import { redirect } from 'next/navigation';
import { AuthShell } from '@/components/auth/AuthShell';
import { LINK_INVALID_PATH } from '@/lib/auth/password-reset';
import { SetPasswordForm } from './SetPasswordForm';

// Session-dependent (relies on the just-established invite session): never prerender.
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * New-user invitation acceptance screen (JA default, EN toggle). Reached ONLY
 * via the /auth/accept-invite callback route, which redirects here
 * immediately after establishing the session -- see that route's own comment
 * for why nothing else may be offered first.
 *
 * Two flows: Staff (`invitation_id` of a workforce invitation, required) and
 * the tenant Owner (`flow=tenant_invite`, Stage 4B-3; `invitation_id` is
 * optional -- when the callback could not read it, the action re-reads the
 * caller's own pending invitations). The id is only a choice among the
 * caller's own invitations; the accept RPCs re-check everything.
 */
export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ invitation_id?: string; flow?: string }>;
}) {
  const { invitation_id: invitationId, flow } = await searchParams;

  if (flow === 'tenant_invite') {
    const ownerInvitationId = invitationId && UUID_RE.test(invitationId) ? invitationId : null;
    return (
      <AuthShell title="ownerInviteTitle" lead="ownerInviteLead">
        <SetPasswordForm flow="tenant_invite" invitationId={ownerInvitationId} />
      </AuthShell>
    );
  }

  if (!invitationId) redirect(`${LINK_INVALID_PATH}?reason=invite`);

  return (
    <AuthShell title="inviteTitle" lead="inviteLead">
      <SetPasswordForm flow="employee" invitationId={invitationId} />
    </AuthShell>
  );
}
