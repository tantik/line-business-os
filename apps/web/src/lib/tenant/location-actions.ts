'use server';

import { redirect } from 'next/navigation';
import { getActiveTenantContext } from './context';
import { loadPageContext } from './page-context';
import { resolveActiveLocation } from './active-location';
import { setActiveLocationCookie } from './active-location.server';
import { parseUuid } from '@/lib/workforce/validation';
import { SIGN_IN_PATH } from '@/lib/auth/require-user';
import { safeWorkspaceReturnPath } from './location-return-path';

/**
 * Server Action of the store switcher (DEBT-139 L2).
 *
 * The submitted `locationId` is never authority: it goes through the STRICT
 * path of `resolveActiveLocation` against the caller's live
 * `api.my_locations` rows of the active tenant; only a match is written to
 * the cookie (canonical ids from the row, never the raw value). Anything
 * else changes nothing. `returnTo` is reduced to an allow-listed workspace
 * path (no open redirect). RLS-scoped client only; no service_role.
 */
export async function setActiveLocation(formData: FormData): Promise<void> {
  const returnTo = safeWorkspaceReturnPath(formData.get('returnTo'));
  const requestedLocationId = parseUuid(formData.get('locationId'));
  if (!requestedLocationId) redirect(returnTo);

  const tenant = await getActiveTenantContext();
  if (tenant.status === 'not_authenticated') redirect(SIGN_IN_PATH);
  if (tenant.status !== 'success') redirect(returnTo);
  const tenantId = tenant.data.activeTenant.tenantId;

  const { myLocations } = await loadPageContext();
  if (myLocations.status !== 'success') redirect(returnTo);

  const resolved = resolveActiveLocation(
    myLocations.data.filter((l) => l.tenantId === tenantId),
    { requestedLocationId },
  );
  if (!resolved.ok) redirect(returnTo);

  await setActiveLocationCookie(tenantId, resolved.location.locationId);
  redirect(returnTo);
}
