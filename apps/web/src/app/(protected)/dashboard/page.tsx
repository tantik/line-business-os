import { requireTenantContext } from '@/lib/tenant/context';
import { signOut } from '@/lib/auth/actions';
import { TenantSwitcher } from '@/components/tenant-switcher';
import {
  ErrorState,
  MissingConfigState,
  NoTenantState,
  UnauthorizedState,
} from '@/components/states';

// Authenticated, session-dependent page: render per request, never prerender.
export const dynamic = 'force-dynamic';

/** Minimal sign-out control; posts to the `signOut` Server Action. */
function SignOutButton() {
  return (
    <form action={signOut}>
      <button
        type="submit"
        style={{
          padding: '8px 14px',
          background: '#fff',
          color: '#111827',
          border: '1px solid #d1d5db',
          borderRadius: 6,
          fontSize: 14,
          cursor: 'pointer',
        }}
      >
        Sign out
      </button>
    </form>
  );
}

/**
 * Minimal authenticated dashboard scaffold. It demonstrates the foundation
 * flow (auth -> membership -> active tenant) and renders the matching safe state
 * for every outcome. It hosts NO product logic - Workforce/Booking/AI modules
 * are not implemented here.
 */
export default async function DashboardPage() {
  const result = await requireTenantContext();

  switch (result.status) {
    case 'success': {
      const { activeTenant, memberships } = result.data;
      return (
        <main style={{ maxWidth: 720, margin: '0 auto', padding: 32 }}>
          <div
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}
          >
            <h1 style={{ margin: 0 }}>Dashboard</h1>
            <SignOutButton />
          </div>
          <p style={{ color: '#6b7280' }}>
            Authenticated foundation scaffold. Modules will mount here in later phases.
          </p>
          <section
            style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginTop: 16 }}
          >
            <h2 style={{ marginTop: 0, fontSize: 16 }}>Active tenant</h2>
            <p style={{ margin: 0 }}>
              <strong>{activeTenant.tenantName}</strong>{' '}
              <span style={{ color: '#6b7280' }}>({activeTenant.tenantSlug})</span>
            </p>
            <p style={{ margin: '4px 0 0', color: '#6b7280' }}>
              kind: {activeTenant.tenantKind} | memberships: {memberships.length}
            </p>
          </section>
          <TenantSwitcher memberships={memberships} activeTenantId={activeTenant.tenantId} />
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
