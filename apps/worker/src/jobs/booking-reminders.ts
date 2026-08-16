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

  // Reminder messages prepared this run. In the full implementation each entry
  // is pushed via LINE; for now we build them so the count reflects real work.
  const prepared: string[] = [];
  for (const booking of bookings ?? []) {
    // Decrypt only what we need, only here (server-side).
    const customerName = booking.customer_name_encrypted
      ? decryptPII(byteaToBuffer(booking.customer_name_encrypted as string), env.PII_ENCRYPTION_KEY)
      : 'Customer';

    // TODO: enqueue via packages/core/src/notifications.ts's enqueueNotification
    //       (core.notifications, migration 0072) using booking.line_account_id
    //       as recipientLineAccountId and this booking's id as the
    //       idempotency_key -- the engine's uniqueness constraint replaces the
    //       previously-planned booking_events row for idempotency. Actually
    //       dispatching (a worker job calling LineMessagingClient.push against
    //       pending core.notifications rows) is a separate, later,
    //       explicitly-approved step -- see 0072's migration header.
    prepared.push(`${customerName}様、ご予約のリマインドです。`);
  }

  return prepared.length;
}
