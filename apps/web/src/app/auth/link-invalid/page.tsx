import type { Metadata } from 'next';
import { AuthLink, AuthShell, AuthText } from '@/components/auth/AuthShell';

/**
 * Landing page for any invalid, expired, revoked or already-used email link
 * (invitation or password reset) -- DEBT-084. Grants nothing; the callback
 * has already discarded any session it opened.
 */
export const metadata: Metadata = { title: 'リンクが無効です', robots: { index: false, follow: false } };

export default function LinkInvalidPage() {
  return (
    <AuthShell title="linkInvalidTitle">
      <AuthText k="linkInvalidBody" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <AuthLink href="/forgot-password" k="requestNewLink" asButton />
        <div style={{ textAlign: 'center' }}>
          <AuthLink href="/sign-in" k="backToSignIn" />
        </div>
      </div>
    </AuthShell>
  );
}
