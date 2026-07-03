import { requireTenantContext } from '@/lib/tenant/context';
import { runAuthBoundarySmoke, type AuthBoundarySmokeResult } from '@/lib/api/auth-boundary-smoke';
import {
  ErrorState,
  MissingConfigState,
  NoTenantState,
  UnauthorizedState,
} from '@/components/states';
import { alertDanger, card, mutedText, pageStyle } from '@/lib/ui/theme';

// Session/tenant-dependent: never prerender.
export const dynamic = 'force-dynamic';

/**
 * LOCAL/DEV-ONLY DIAGNOSTIC PAGE (Phase 1J-1H). Not a product feature.
 *
 * Server-rendered only (no 'use client'). Proves the apps/web -> apps/api
 * auth-boundary chain: resolves the current tenant context, then calls the
 * server-only `runAuthBoundarySmoke` helper (`@/lib/api/auth-boundary-smoke`),
 * which is the only place in apps/web that calls apps/api. The browser never
 * calls apps/api directly and never sees the access token.
 */
function SmokeResultView({ smoke, tenantLabel }: { smoke: AuthBoundarySmokeResult; tenantLabel: string }) {
  switch (smoke.status) {
    case 'config_missing':
      return (
        <p style={alertDanger}>
          apps/api base URL is not configured (<code>LINE_OS_API_INTERNAL_URL</code>). Smoke test
          skipped.
        </p>
      );
    case 'unauthenticated':
      return <p style={alertDanger}>apps/api rejected the request: not authenticated.</p>;
    case 'bad_request':
      return <p style={alertDanger}>apps/api rejected the request: malformed tenant/location id.</p>;
    case 'forbidden':
      return <p style={alertDanger}>apps/api denied the request: permission not held for this tenant.</p>;
    case 'unexpected_error':
      return <p style={alertDanger}>apps/api returned an unexpected error.</p>;
    case 'ok':
      return (
        <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
          <div>
            <dt style={{ ...mutedText, fontSize: 13 }}>Status</dt>
            <dd style={{ margin: '4px 0 0' }}>ok</dd>
          </div>
          <div>
            <dt style={{ ...mutedText, fontSize: 13 }}>Permission checked</dt>
            <dd style={{ margin: '4px 0 0' }}>{smoke.permission}</dd>
          </div>
          <div>
            <dt style={{ ...mutedText, fontSize: 13 }}>Tenant</dt>
            <dd style={{ margin: '4px 0 0', overflowWrap: 'anywhere' }}>{tenantLabel}</dd>
          </div>
          {smoke.locationId ? (
            <div>
              <dt style={{ ...mutedText, fontSize: 13 }}>Location id</dt>
              <dd style={{ margin: '4px 0 0', overflowWrap: 'anywhere' }}>{smoke.locationId}</dd>
            </div>
          ) : null}
        </dl>
      );
  }
}

export default async function AuthBoundarySmokePage() {
  const tenantResult = await requireTenantContext();

  switch (tenantResult.status) {
    case 'no_membership':
      return <NoTenantState />;
    case 'unauthorized':
      return <UnauthorizedState />;
    case 'config_error':
      return <MissingConfigState />;
    case 'unexpected_error':
      return <ErrorState />;
    case 'success':
      break;
    default:
      return <ErrorState />;
  }

  const { activeTenant } = tenantResult.data;
  const smoke = await runAuthBoundarySmoke({
    tenantId: activeTenant.tenantId,
    locationId: activeTenant.locationId,
  });

  return (
    <main style={pageStyle(720)}>
      <h1 style={{ margin: 0 }}>Auth-boundary smoke test</h1>
      <p style={{ margin: '8px 0 0', ...mutedText }}>
        Local/dev-only diagnostic (Phase 1J-1H). Proves the apps/web (server-side) → apps/api
        auth-boundary chain works end to end. Not a product feature.
      </p>
      <section style={card}>
        <SmokeResultView smoke={smoke} tenantLabel={activeTenant.tenantSlug} />
      </section>
    </main>
  );
}
