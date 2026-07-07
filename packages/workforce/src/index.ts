import { z } from 'zod';

/**
 * Workforce module domain contracts.
 *
 * Source reference: tantik/cafe-shift (UI/demo logic to be migrated here as
 * domain services). Every entity is tenant-scoped; physical assignment is
 * location-scoped. Persistence + RLS live in supabase/migrations/0009_workforce.
 */

export const RequestStatus = z.enum(['pending', 'approved', 'rejected', 'cancelled']);
export type RequestStatus = z.infer<typeof RequestStatus>;

export const AttendanceStatus = z.enum(['present', 'late', 'absent', 'on_leave']);
export type AttendanceStatus = z.infer<typeof AttendanceStatus>;

export const Employee = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  locationId: z.string().uuid().nullable(),
  name: z.string().min(1), // decrypted at the service boundary
  positionLabel: z.string().nullable().optional(),
  isActive: z.boolean().default(true),
});
export type Employee = z.infer<typeof Employee>;

export const CreateShiftInput = z.object({
  tenantId: z.string().uuid(),
  locationId: z.string().uuid(),
  employeeId: z.string().uuid().optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  role: z.string().optional(),
  notes: z.string().optional(),
});
export type CreateShiftInput = z.infer<typeof CreateShiftInput>;

export const LeaveRequestInput = z.object({
  tenantId: z.string().uuid(),
  locationId: z.string().uuid().optional(),
  employeeId: z.string().uuid(),
  startsOn: z.string().date(),
  endsOn: z.string().date(),
  reason: z.string().optional(),
});
export type LeaveRequestInput = z.infer<typeof LeaveRequestInput>;

export const WORKFORCE_ROUTES = {
  base: '/workforce',
  manager: '/workforce/manager',
  shifts: '/workforce/shifts',
  // Legacy redirects (preserve old demo URLs): /shifts, /manager
} as const;
