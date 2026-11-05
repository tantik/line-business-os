'use server';

import { createClient } from '@/lib/supabase/server';
import { requireTenantContext } from '@/lib/tenant/context';
import { getActiveLocation } from '@/lib/tenant/active-location.server';
import type { TenantAccessResult } from '@/lib/tenant/types';
import { listAttendanceForManager, type WorkforceAttendance } from './attendance';
import { isSelectableReportMonth, monthDateRange } from './attendance-month';
import { hasManagerAccess } from './manager-access';
import { todayIsoInTimeZone } from './timezone';
import { parseUuid } from './validation';

/**
 * QA4 F2: one staff member's attendance for ONE month, for the Manager's
 * Staff monthly report popup when that month is outside the page-load window
 * (`managerAttendanceLoadRange`). Read-only, request-scoped anon client (RLS
 * `wf_attendance_manage` remains the real boundary). Authorized exactly like
 * the Manager page itself: tenant from the caller's membership, the ACTIVE
 * store (`getActiveLocation`, DEBT-139 L2), then `hasManagerAccess` (`workforce.staff.manage`)
 * before any attendance read. The month must be selectable (current month or
 * up to 12 months back, in the location's time zone).
 */
export async function loadStaffMonthAttendance(
  rawEmployeeId: string,
  rawMonthPrefix: string,
): Promise<TenantAccessResult<WorkforceAttendance[]>> {
  const employeeId = parseUuid(rawEmployeeId);
  if (!employeeId || typeof rawMonthPrefix !== 'string') return { status: 'unexpected_error', message: 'Invalid input.' };

  const tenantContext = await requireTenantContext();
  if (tenantContext.status !== 'success') return tenantContext;
  const tenantId = tenantContext.data.activeTenant.tenantId;

  const supabase = await createClient();
  const activeLocation = await getActiveLocation(tenantId, tenantContext.data.activeTenant.locationId);
  if (activeLocation.status === 'unexpected_error') return activeLocation;
  if (activeLocation.status !== 'success') return { status: 'unauthorized', message: 'No active location.' };
  const { location } = activeLocation.data;

  const managerAccess = await hasManagerAccess(supabase, tenantId, location.locationId);
  if (!managerAccess) return { status: 'unauthorized', message: 'Manager access required.' };

  const currentMonth = todayIsoInTimeZone(location.timezone).slice(0, 7);
  if (!isSelectableReportMonth(rawMonthPrefix, currentMonth)) return { status: 'unexpected_error', message: 'Invalid month.' };

  const { fromDate, toDate } = monthDateRange(rawMonthPrefix);
  // This store only (DEBT-139 L2): same scope as the current months the
  // dashboard loads (0155), so old and recent months never disagree.
  return listAttendanceForManager(supabase, tenantId, { fromDate, toDate, employeeId, locationId: location.locationId });
}
