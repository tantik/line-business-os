import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isPlatformStaff } from '@/lib/platform/platform-staff';
import { listPlatformTenantProvisioning } from '@/lib/platform/provisioning-list';
import { pageStyle } from '@/lib/ui/theme';
import { TenantsConsole } from './tenants-console';

// Authenticated, session-dependent page: render per request, never prerender.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'テナント管理', robots: { index: false, follow: false } };

/**
 * ORUWA admin console (Stage 4B-3): platform staff create and retry tenant
 * provisioning. The `(protected)` layout already requires a session.
 *
 * Gate: `api.is_platform_staff()` with the caller's own JWT; anyone else gets
 * a plain 404 (the console's existence is not advertised). Not the boundary:
 * the list RPC (0135) and the provision-tenant Edge Function re-check the
 * flag themselves. One RPC per page view, no timers: the list refreshes after
 * an action (`router.refresh`) -- staff-only, so no Realtime cost.
 */
export default async function AdminTenantsPage() {
  const supabase = await createClient();
  if (!(await isPlatformStaff(supabase))) notFound();

  const list = await listPlatformTenantProvisioning(supabase);
  if (list.status === 'unauthorized') notFound();

  return (
    <main style={pageStyle(1100)}>
      <TenantsConsole rows={list.status === 'success' ? list.data : null} />
    </main>
  );
}
