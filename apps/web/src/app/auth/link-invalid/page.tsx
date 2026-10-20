import type { Metadata } from 'next';
import { AuthLink, AuthShell, AuthText } from '@/components/auth/AuthShell';
import type { AuthCopyKey } from '@/lib/auth/auth-copy';

/**
 * Landing page for any invalid, expired, revoked or already-used email link
 * (invitation or password reset) -- DEBT-084. Grants nothing; the callback
 * has already discarded any session it opened. `?reason=` only selects the
 * help text: staff with a dead invitation must ask the manager, so they are
 * not pushed towards a reset email for an account that has no password yet.
 * Owner reasons (Stage 4B-3): `owner` (link itself dead), `owner_expired`,
 * `owner_none` -- an Owner asks ORUWA support, or simply signs in when the
 * link was already used to finish setup.
 */
export const metadata: Metadata = { title: 'リンクが無効です', robots: { index: false, follow: false } };

const BODY_BY_REASON: Record<string, AuthCopyKey> = {
  invite: 'linkInvalidInviteBody',
  reset: 'linkInvalidResetBody',
  owner: 'linkInvalidOwnerBody',
  owner_expired: 'linkInvalidOwnerExpiredBody',
  owner_none: 'linkInvalidOwnerNoneBody',
};

export default async function LinkInvalidPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams;
  const body = (reason && BODY_BY_REASON[reason]) || 'linkInvalidBody';
  // Invitations (staff or owner) cannot be revived by a reset email.
  const offerReset = reason !== 'invite' && !reason?.startsWith('owner');

  return (
    <AuthShell title="linkInvalidTitle" documentTitle="linkInvalidTitle">
      <AuthText k={body} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {offerReset ? <AuthLink href="/forgot-password" k="requestNewLink" asButton /> : null}
        <div style={{ textAlign: 'center' }}>
          <AuthLink href="/sign-in" k="backToSignIn" />
        </div>
      </div>
    </AuthShell>
  );
}
