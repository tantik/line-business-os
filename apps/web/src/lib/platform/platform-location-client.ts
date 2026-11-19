import 'server-only';
import { requirePublicSupabaseEnv } from '@/lib/supabase/env';
import { mapPlatformLocationResponse, platformLocationRequestBody, type PlatformLocationCommand, type PlatformLocationResult } from './platform-location';

/**
 * Calls the platform-location Supabase Edge Function (DEBT-139 L3c) for the
 * admin console's Server Actions. Same call shape as `callProvisionTenant`:
 * the CALLER'S OWN access token is forwarded as the Authorization header, and
 * the only key sent is the public (publishable) one as `apikey`. apps/web
 * never holds or forwards a privileged key -- that lives only inside the
 * function, which re-verifies the JWT and the platform-staff flag itself.
 *
 * Body = `platformLocationRequestBody` (request_id + action + that action's
 * keys; the function refuses any other key, so an actor id can never be
 * supplied from here). Nothing is logged here.
 */
export async function callPlatformLocation(
  accessToken: string,
  requestId: string,
  command: PlatformLocationCommand,
): Promise<PlatformLocationResult> {
  const { url, key } = requirePublicSupabaseEnv();
  const endpoint = `${url.replace(/\/$/, '')}/functions/v1/platform-location`;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(platformLocationRequestBody(requestId, command)),
      cache: 'no-store',
    });
  } catch {
    return mapPlatformLocationResponse(null, null);
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Unreadable body: the HTTP status alone decides (e.g. 404 = not deployed).
  }
  return mapPlatformLocationResponse(response.status, body);
}
