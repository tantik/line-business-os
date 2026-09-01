/**
 * PII-aware demo seeder.
 *
 * Runs AFTER `supabase/seed/seed.sql` (which creates tenants/locations/modules).
 * Inserts fake-but-realistic demo data that requires encryption + blind index
 * (employees, bookings with customer PII) so columns are populated correctly.
 *
 * Usage: pnpm --filter @line-os/db seed
 * Requires: SUPABASE_URL, SUPABASE_SECRET_KEY, SUPABASE_PUBLISHABLE_KEY,
 *           PII_ENCRYPTION_KEY, PII_HASH_PEPPER in the environment.
 */
import { serverEnv } from '@line-os/config/env';
import { createServiceClient } from '../src/client.js';
import { encryptPII, blindIndex, protectSearchablePII, bufferToBytea } from '../src/crypto.js';

const DEMO_CAFE = '11111111-1111-1111-1111-111111111111';
const CAFE_LOCATION = '1a111111-0000-0000-0000-000000000001';
const DEMO_SALON = '22222222-2222-2222-2222-222222222222';
const SALON_LOCATION = '2a222222-0000-0000-0000-000000000001';

async function main() {
  const env = serverEnv();
  const db = createServiceClient();
  const enc = env.PII_ENCRYPTION_KEY;
  const pepper = env.PII_HASH_PEPPER;

  // Workforce demo employees (cafe) ----------------------------------------
  const employees = ['Aiko Tanaka', 'Kenji Sato', 'Mei Suzuki'].map((name) => ({
    tenant_id: DEMO_CAFE,
    location_id: CAFE_LOCATION,
    name_encrypted: bufferToBytea(encryptPII(name, enc)),
    name_hash: blindIndex(name, pepper),
    position_label: 'Barista',
    employment_type: 'part_time',
  }));

  const { error: empErr } = await db.schema('workforce').from('employees').upsert(employees);
  if (empErr) throw empErr;

  // Booking demo customers (salon) -----------------------------------------
  const now = new Date();
  const bookings = [
    { name: 'Yuki Nakamura', phone: '+819011112222', email: 'yuki@example.jp' },
    { name: 'Haruto Ito', phone: '+819033334444', email: 'haruto@example.jp' },
  ].map((c, i) => {
    const phone = protectSearchablePII(c.phone, { encryptionKey: enc, pepper, kind: 'phone' });
    const email = protectSearchablePII(c.email, { encryptionKey: enc, pepper, kind: 'email' });
    const starts = new Date(now.getTime() + (i + 1) * 24 * 3600 * 1000);
    return {
      tenant_id: DEMO_SALON,
      location_id: SALON_LOCATION,
      customer_name_encrypted: bufferToBytea(encryptPII(c.name, enc)),
      customer_phone_encrypted: bufferToBytea(phone.encrypted),
      customer_phone_hash: phone.hash,
      customer_email_encrypted: bufferToBytea(email.encrypted),
      customer_email_hash: email.hash,
      starts_at: starts.toISOString(),
      ends_at: new Date(starts.getTime() + 60 * 60 * 1000).toISOString(),
      status: 'confirmed' as const,
    };
  });

  const { error: bkErr } = await db.schema('booking').from('bookings').upsert(bookings);
  if (bkErr) throw bkErr;

  console.log(`Seeded ${employees.length} demo employees and ${bookings.length} demo bookings.`);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
