import type { Metadata } from 'next';
import { AuthLink, AuthShell, AuthText } from '@/components/auth/AuthShell';

/**
 * Landing page for any invalid, expired, revoked or already-used email link
 * (invitation or password reset) -- DEBT-084. Grants nothing; the callback
 * has already discarded any session it opened. `?reason=` only selects the
 * help text: staff with a dead invitation must ask the manager, so they are
 * not pushed towards a reset email for an account that has no password yet.
 */
export const metadata: Metadata = { title: 'リンクが無効です', robots: { index: false, follow: false } };

export default async function LinkInvalidPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams;
  const body = reason === 'invite' ? 'linkInvalidInviteBody' : reason === 'reset' ? 'linkInvalidResetBody' : 'linkInvalidBody';

  return (
    <AuthShell title="linkInvalidTitle">
      <AuthText k={body} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {reason === 'invite' ? null : <AuthLink href="/forgot-password" k="requestNewLink" asButton />}
        <div style={{ textAlign: 'center' }}>
          <AuthLink href="/sign-in" k="backToSignIn" />
        </div>
      </div>
    </AuthShell>
  );
}
