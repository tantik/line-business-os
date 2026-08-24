import type { Metadata } from 'next';
import Link from 'next/link';
import { requireTenantContext } from '@/lib/tenant/context';
import { ErrorState, MissingConfigState, NoTenantState, UnauthorizedState } from '@/components/states';
import { backLink, card, mutedText, pageStyle } from '@/lib/ui/theme';

// Authenticated, session-dependent page: render per request, never prerender.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Purchases', robots: { index: false, follow: false } };

/**
 * Placeholder for the not-yet-built Purchases module (Founder decision,
 * 2026-08-24: the Staff/Manager entry-points row gets a third "Purchases"
 * button now, ahead of the actual feature, rather than blocking that
 * navigation-parity change on a full purchasing module design). No data, no
 * module gate -- just confirms the caller is a real tenant member.
 */
export default async function PurchasesPage() {
  const result = await requireTenantContext();

  switch (result.status) {
    case 'success': {
      return (
        <main style={pageStyle(720)}>
          <header>
            <h1 style={{ margin: 0 }}>Purchases</h1>
            <Link href="/dashboard" style={{ ...backLink, marginTop: 12 }}>
              Back to dashboard
            </Link>
          </header>
          <section style={{ ...card, marginTop: 16 }}>
            <p style={{ margin: 0, ...mutedText }}>Purchases is coming soon.</p>
          </section>
        </main>
      );
    }
    case 'no_membership':
      return <NoTenantState />;
    case 'unauthorized':
      return <UnauthorizedState />;
    case 'config_error':
      return <MissingConfigState />;
    case 'unexpected_error':
      return <ErrorState />;
    // `not_authenticated` is already redirected to sign-in by requireTenantContext.
    default:
      return <ErrorState />;
  }
}
