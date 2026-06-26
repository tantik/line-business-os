import { setActiveTenant } from '@/lib/tenant/actions';
import { TENANT_SELECT_FIELD } from '@/lib/tenant/selection';
import type { TenantMembership } from '@/lib/tenant/types';

/**
 * Presentational tenant switcher (Server Component, no client state).
 *
 * Renders one button-per-tenant form that posts the selected tenant id to the
 * `setActiveTenant` Server Action. The submitted id is only a technical form
 * value, NOT authority — the action revalidates it against live memberships
 * before writing the active-tenant cookie. No `localStorage`, no URL tenant
 * routes, no client-side state. Renders nothing for a single membership.
 */
export function TenantSwitcher({
  memberships,
  activeTenantId,
}: {
  memberships: TenantMembership[];
  activeTenantId: string;
}) {
  if (memberships.length <= 1) return null;

  return (
    <section style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginTop: 16 }}>
      <h2 style={{ marginTop: 0, fontSize: 16 }}>Switch tenant</h2>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
        {memberships.map((m) => {
          const isActive = m.tenantId === activeTenantId;
          return (
            <li key={m.tenantId}>
              <form action={setActiveTenant}>
                <input type="hidden" name={TENANT_SELECT_FIELD} value={m.tenantId} />
                <button
                  type="submit"
                  disabled={isActive}
                  aria-current={isActive ? 'true' : undefined}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '8px 12px',
                    background: isActive ? '#eef2ff' : '#fff',
                    color: '#111827',
                    border: `1px solid ${isActive ? '#6366f1' : '#d1d5db'}`,
                    borderRadius: 6,
                    fontSize: 14,
                    cursor: isActive ? 'default' : 'pointer',
                  }}
                >
                  <strong>{m.tenantName}</strong>{' '}
                  <span style={{ color: '#6b7280' }}>({m.tenantSlug})</span>
                  {m.locationId ? (
                    <span style={{ color: '#6b7280' }}> · location: {m.locationId}</span>
                  ) : null}
                  {isActive ? <span style={{ color: '#6366f1' }}> · active</span> : null}
                </button>
              </form>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
