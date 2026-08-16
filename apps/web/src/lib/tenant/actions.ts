'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getUserFromClient } from '@/lib/auth/user';
import { SIGN_IN_PATH } from '@/lib/auth/require-user';
import { listTenantMemberships } from './membership';
import { selectActiveTenant } from './select';
import { setActiveTenantCookie } from './active-tenant-cookie.server';
import { parseSelectedTenantId } from './selection';

/**
 * Server Action for the tenant switcher.
 *
 * SECURITY (authority model):
 * - The submitted `tenantId` is NEVER trusted as authority. It is parsed into a
 *   candidate UUID shape only, then revalidated against the authenticated user's
 *   LIVE memberships through the STRICT `requestedTenantId` path of
 *   `selectActiveTenant` (valid member -> selected; non-member -> no fallback).
 * - The active-tenant cookie is written ONLY after that live membership check
 *   succeeds, and stores the canonical tenant id resolved from the membership
 *   (never the raw form value).
 * - Any failure (missing/malformed selection, unauthenticated, non-member,
 *   read error) results in a safe redirect to `/dashboard` with NO cookie write
 *   and no internal error surfaced to the UI.
 * - Uses only the request-scoped anon-key server client (RLS is the boundary);
 *   the service-role key is never imported or used here.
 */
const DASHBOARD_PATH = '/dashboard';

export async function setActiveTenant(formData: FormData): Promise<void> {
  const requestedTenantId = parseSelectedTenantId(formData);
  // Malformed/missing selection: do nothing, fail safe to the dashboard.
  if (!requestedTenantId) redirect(DASHBOARD_PATH);

  const supabase = await createClient();

  const user = await getUserFromClient(supabase);
  if (!user) redirect(SIGN_IN_PATH);

  const memberships = await listTenantMemberships(supabase, user.id);
  if (memberships.status !== 'success') redirect(DASHBOARD_PATH);

  // STRICT: an explicit request must match a live membership or fail closed.
  const selected = selectActiveTenant(memberships.data, { requestedTenantId });
  if (!selected.ok) redirect(DASHBOARD_PATH);

  // Authority confirmed: persist the canonical tenant id from the membership.
  await setActiveTenantCookie(selected.tenant.tenantId);
  redirect(DASHBOARD_PATH);
}
