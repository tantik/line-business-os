import { createServiceClient, decryptPII, byteaToBuffer } from '@line-os/db';
import { serverEnv } from '@line-os/config/env';

/**
 * Send LINE reminders for upcoming confirmed bookings.
 *
 * Skeleton: queries bookings in a reminder window, resolves the per-tenant LINE
 * channel + recipient (decrypting PII server-side), and pushes a reminder.
 * Records a booking_event so reminders are not sent twice.
 *
 * Returns the number of reminders sent.
 */
export async function sendBookingReminders(): Promise<number> {
  const env = serverEnv();
  const db = createServiceClient();

  const windowStart = new Date(Date.now() + 23 * 60 * 60 * 1000).toISOString();
  const windowEnd = new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString();

  const { data: bookings, error } = await db
    .schema('booking')
    .from('bookings')
    .select('id, tenant_id, location_id, starts_at, customer_name_encrypted, line_account_id, status')
    .eq('status', 'confirmed')
    .gte('starts_at', windowStart)
    .lte('starts_at', windowEnd);

  if (error) throw error;

  let sent = 0;
  for (const booking of bookings ?? []) {
    // Decrypt only what we need, only here (server-side).
    const _name = booking.customer_name_encrypted
      ? decryptPII(byteaToBuffer(booking.customer_name_encrypted as string), env.PII_ENCRYPTION_KEY)
      : 'Customer';

    // TODO: resolve tenant LINE channel (core.line_channels) + recipient line id
    //       (core.line_accounts), then push via LineMessagingClient, and insert
    //       a booking_events row of type 'reminded' to ensure idempotency.
    sent += 1;
  }

  return sent;
}
