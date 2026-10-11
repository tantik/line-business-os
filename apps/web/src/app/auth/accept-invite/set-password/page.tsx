import { redirect } from 'next/navigation';
import { AuthShell } from '@/components/auth/AuthShell';
import { LINK_INVALID_PATH } from '@/lib/auth/password-reset';
import { SetPasswordForm } from './SetPasswordForm';

// Session-dependent (relies on the just-established invite session): never prerender.
export const dynamic = 'force-dynamic';

/**
 * New-user Staff invitation acceptance screen (JA default, EN toggle --
 * staff-facing). Reached ONLY via the /auth/accept-invite callback route,
 * which redirects here immediately after establishing the session -- see
 * that route's own comment for why nothing else may be offered first.
 */
export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ invitation_id?: string }>;
}) {
  const { invitation_id: invitationId } = await searchParams;
  if (!invitationId) redirect(`${LINK_INVALID_PATH}?reason=invite`);

  return (
    <AuthShell title="inviteTitle" lead="inviteLead">
      <SetPasswordForm invitationId={invitationId} />
    </AuthShell>
  );
}
