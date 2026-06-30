import { requireTenantContext } from '@/lib/tenant/context';
import { createClient } from '@/lib/supabase/server';
import { listTenantAdminMembers } from '@/lib/tenant/admin-members';
import Link from 'next/link';
import {
  ErrorState,
  MissingConfigState,
  NoTenantState,
  UnauthorizedState,
} from '@/components/states';

// Authenticated, session-dependent page: render per request, never prerender.
export const dynamic = 'force-dynamic';

const sections = ['Locations management', 'Modules management', 'Members and roles', 'Billing'];

type AdminMembersResult = Awaited<ReturnType<typeof listTenantAdminMembers>>;

function AdminMembersSummary({ result }: { result: AdminMembersResult }) {
  if (result.status === 'success') {
    return (
      <section style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16 }}>Manageable members</h2>
            <p style={{ margin: '6px 0 0', color: '#6b7280' }}>
              Read-only membership rows available to tenant admins.
            </p>
          </div>
          <span style={{ color: '#6b7280', fontSize: 14, whiteSpace: 'nowrap' }}>
            total: {result.data.length}
          </span>
        </div>

        {result.data.length === 0 ? (
          <p style={{ margin: '12px 0 0', color: '#6b7280' }}>
            No manageable member rows available.
          </p>
        ) : (
          <div style={{ overflowX: 'auto', marginTop: 12 }}>
            <table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#6b7280' }}>
                  <th style={{ borderBottom: '1px solid #e5e7eb', padding: '8px 10px' }}>Tenant</th>
                  <th style={{ borderBottom: '1px solid #e5e7eb', padding: '8px 10px' }}>Slug</th>
                  <th style={{ borderBottom: '1px solid #e5e7eb', padding: '8px 10px' }}>Kind</th>
                  <th style={{ borderBottom: '1px solid #e5e7eb', padding: '8px 10px' }}>
                    Location scope
                  </th>
                  <th style={{ borderBottom: '1px solid #e5e7eb', padding: '8px 10px' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {result.data.map((member, index) => (
                  <tr
                    key={`${member.tenantId}:${member.locationId ?? 'all'}:${member.membershipStatus}:${index}`}
                  >
                    <td style={{ borderBottom: '1px solid #f3f4f6', padding: '10px' }}>
                      <strong>{member.tenantName}</strong>
                    </td>
                    <td
                      style={{
                        borderBottom: '1px solid #f3f4f6',
                        padding: '10px',
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {member.tenantSlug}
                    </td>
                    <td style={{ borderBottom: '1px solid #f3f4f6', padding: '10px' }}>
                      {member.tenantKind}
                    </td>
                    <td
                      style={{
                        borderBottom: '1px solid #f3f4f6',
                        padding: '10px',
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {member.locationId ?? 'All locations'}
                    </td>
                    <td style={{ borderBottom: '1px solid #f3f4f6', padding: '10px' }}>
                      {member.membershipStatus}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    );
  }

  if (result.status === 'unauthorized') {
    return (
      <section style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginTop: 16 }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>Manageable members</h2>
        <p style={{ margin: '8px 0 0', color: '#6b7280' }}>
          Member summary is unavailable for this tenant.
        </p>
      </section>
    );
  }

  return (
    <section style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginTop: 16 }}>
      <h2 style={{ margin: 0, fontSize: 16 }}>Manageable members</h2>
      <p style={{ margin: '8px 0 0', color: '#6b7280' }}>
        Member summary could not be loaded.
      </p>
    </section>
  );
}

export default async function TenantAdminPage() {
  const result = await requireTenantContext();

  switch (result.status) {
    case 'success': {
      const { activeTenant } = result.data;
      const supabase = await createClient();
      const membersResult = await listTenantAdminMembers(supabase);

      return (
        <main style={{ maxWidth: 960, margin: '0 auto', padding: 32 }}>
          <header>
            <h1 style={{ margin: 0 }}>Tenant admin</h1>
            <p style={{ margin: '8px 0 0', color: '#6b7280' }}>
              Tenant management tools will be enabled in later phases.
            </p>
            <Link
              href="/dashboard"
              style={{
                display: 'inline-block',
                marginTop: 12,
                color: '#111827',
                fontSize: 14,
                textDecoration: 'underline',
              }}
            >
              Back to dashboard
            </Link>
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

          <AdminMembersSummary result={membersResult} />

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
