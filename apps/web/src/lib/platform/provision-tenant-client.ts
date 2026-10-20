import 'server-only';
import { requirePublicSupabaseEnv } from '@/lib/supabase/env';
import { mapProvisionResponse, type ProvisionOutcome } from './provision-outcome';
import type { ProvisioningFormInput } from './provisioning-form';

/**
 * Calls the provision-tenant Supabase Edge Function (Stage 4B-2) for the admin
 * console's Server Action. Same call shape as `inviteOrResendWorkforceEmployee`:
 * the CALLER'S OWN access token is forwarded as the Authorization header, and
 * the only key sent is the public (publishable) one as `apikey`. apps/web never
 * holds or forwards a privileged key -- that lives only inside the function,
 * which re-verifies the JWT and the platform-staff flag itself.
 *
 * Body is exactly `{ request_id, input }` (the function refuses any other key,
 * so an actor id can never be supplied from here). The owner email travels
 * only in this server-to-server request body; it is never logged here.
 */
export async function callProvisionTenant(
  accessToken: string,
  requestId: string,
  input: ProvisioningFormInput,
): Promise<ProvisionOutcome> {
  const { url, key } = requirePublicSupabaseEnv();
  const endpoint = `${url.replace(/\/$/, '')}/functions/v1/provision-tenant`;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        request_id: requestId,
        input: {
          businessName: input.businessName,
          tenantSlug: input.tenantSlug,
          locationName: input.locationName,
          timezone: input.timezone,
          ownerEmail: input.ownerEmail,
        },
      }),
      cache: 'no-store',
    });
  } catch {
    return mapProvisionResponse(null, null, requestId);
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Unreadable body: the HTTP status alone decides (e.g. 404 = not deployed).
  }
  return mapProvisionResponse(response.status, body, requestId);
}
