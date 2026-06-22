import { z } from 'zod';

/**
 * Booking module domain contracts.
 *
 * Source reference: tantik/line-app (salon logic / LINE / Supabase concepts to
 * be migrated here). Every entity is tenant-scoped; scheduling is
 * location-scoped. Customer PII is encrypted + hashed at the service boundary.
 * Persistence + RLS live in supabase/migrations/0010_booking.
 */

export const BookingStatus = z.enum([
  'pending',
  'confirmed',
  'cancelled',
  'completed',
  'no_show',
]);
export type BookingStatus = z.infer<typeof BookingStatus>;

export const Service = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  locationId: z.string().uuid().nullable(),
  name: z.string().min(1),
  durationMinutes: z.number().int().positive(),
  priceCents: z.number().int().nonnegative(),
  currency: z.string().default('JPY'),
  isActive: z.boolean().default(true),
});
export type Service = z.infer<typeof Service>;

/** Public booking submission (e.g. from LIFF). PII is protected server-side. */
export const PublicBookingInput = z.object({
  tenantId: z.string().uuid(),
  locationId: z.string().uuid(),
  serviceId: z.string().uuid(),
  staffId: z.string().uuid().optional(),
  startsAt: z.string().datetime(),
  customer: z.object({
    name: z.string().min(1),
    phone: z.string().min(1),
    email: z.string().email().optional(),
    lineUserId: z.string().optional(),
  }),
  notes: z.string().optional(),
});
export type PublicBookingInput = z.infer<typeof PublicBookingInput>;

export const BOOKING_ROUTES = {
  base: '/booking',
  admin: '/booking/admin',
  public: '/booking/new',
} as const;
