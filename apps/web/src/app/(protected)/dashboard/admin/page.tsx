import { requireTenantContext } from '@/lib/tenant/context';
import {
  ErrorState,
  MissingConfigState,
  NoTenantState,
  UnauthorizedState,
} from '@/components/states';

// Authenticated, session-dependent page: render per request, never prerender.
export const dynamic = 'force-dynamic';

const sections = ['Locations management', 'Modules management', 'Members and roles', 'Billing'];

export default async function TenantAdminPage() {
  const result = await requireTenantContext();

  switch (result.status) {
    case 'success': {
      const { activeTenant } = result.data;

      return (
        <main style={{ maxWidth: 960, margin: '0 auto', padding: 32 }}>
          <header>
            <h1 style={{ margin: 0 }}>Tenant admin</h1>
            <p style={{ margin: '8px 0 0', color: '#6b7280' }}>
              Tenant management tools will be enabled in later phases.
            </p>
          </header>

          <section
            style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginTop: 16 }}
          >
            <h2 style={{ marginTop: 0, fontSize: 16 }}>Active tenant</h2>
            <p style={{ margin: 0 }}>
              <strong>{activeTenant.tenantName}</strong>{' '}
              <span style={{ color: '#6b7280' }}>({activeTenant.tenantSlug})</span>
            </p>
          </section>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 12,
              marginTop: 16,
            }}
          >
            {sections.map((section) => (
              <section
                key={section}
                style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}
              >
                <h2 style={{ margin: 0, fontSize: 16 }}>{section}</h2>
                <p style={{ margin: '8px 0 0', color: '#6b7280' }}>Coming later.</p>
              </section>
            ))}
          </div>
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
