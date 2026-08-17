'use server';

import { createClient } from '@/lib/supabase/server';
import { requireTenantContext } from '@/lib/tenant/context';
import { listTenantLocations } from '@/lib/tenant/locations';
import { getMyWorkforceStaffProfile } from './staff-profile';
import { submitWorkReport as submitWorkReportWrite, type WorkforceAttendance } from './attendance';
import { submitCorrectionRequest as submitCorrectionRequestWrite, decideCorrectionRequest as decideCorrectionRequestWrite, type WorkforceShiftRequest } from './shift-requests';
import { localDateTimeToUtcIso } from './timezone';
import {
  parseDecideCorrectionRequestInput,
  parseSubmitCorrectionRequestInput,
  parseSubmitWorkReportInput,
} from './attendance-input';
import type { WorkforceWriteResult } from './result-types';

/**
 * Server Actions for attendance / work reports + correction requests. Thin
 * controllers, same shape as `staff-actions.ts`/`schedule-actions.ts`: the
 * two self-scoped actions resolve the caller's own staff profile first (a
 * clearer error than an opaque RLS denial for a caller with no staff row),
 * `decideCorrectionRequest` relies entirely on RLS (`wf_shift_requests_write`,
 * `workforce.request.manage`).
 */

const INVALID_INPUT_RESULT = { status: 'unexpected_error', message: 'Invalid input.' } as const;
const NO_STAFF_PROFILE_RESULT = { status: 'unexpected_error', message: 'You have no staff profile in this tenant.' } as const;

export async function submitWorkReport(formData: FormData): Promise<WorkforceWriteResult<WorkforceAttendance>> {
  const input = parseSubmitWorkReportInput(formData);
  if (!input) return INVALID_INPUT_RESULT;

  const tenantContext = await requireTenantContext();
  if (tenantContext.status !== 'success') return tenantContext;

  const supabase = await createClient();
  const tenantId = tenantContext.data.activeTenant.tenantId;

  const myProfile = await getMyWorkforceStaffProfile(supabase, tenantId);
  if (myProfile.status !== 'success') return myProfile;
  if (!myProfile.data) return NO_STAFF_PROFILE_RESULT;
  if (!myProfile.data.locationId) return { status: 'unexpected_error', message: 'Your staff profile has no assigned location.' };

  let clockIn: string | null = null;
  let clockOut: string | null = null;
  if (input.clockInLocal || input.clockOutLocal) {
    const locationsResult = await listTenantLocations(supabase);
    if (locationsResult.status !== 'success') return locationsResult;
    const location = locationsResult.data.find((l) => l.tenantId === tenantId && l.locationId === myProfile.data!.locationId);
    if (!location) return { status: 'not_found' };

    if (input.clockInLocal) clockIn = localDateTimeToUtcIso(input.workDate, input.clockInLocal, location.timezone);
    if (input.clockOutLocal) clockOut = localDateTimeToUtcIso(input.workDate, input.clockOutLocal, location.timezone);
  }

  return submitWorkReportWrite(supabase, tenantId, {
    employeeId: myProfile.data.staffId,
    locationId: myProfile.data.locationId,
    workDate: input.workDate,
    clockIn,
    clockOut,
    actualBreakMinutes: input.actualBreakMinutes ?? undefined,
    transportationCost: input.transportationCost,
    dailyMessage: input.dailyMessage,
  });
}

export async function submitCorrectionRequest(formData: FormData): Promise<WorkforceWriteResult<WorkforceShiftRequest>> {
  const input = parseSubmitCorrectionRequestInput(formData);
  if (!input) return INVALID_INPUT_RESULT;

  const tenantContext = await requireTenantContext();
  if (tenantContext.status !== 'success') return tenantContext;

  const supabase = await createClient();
  const tenantId = tenantContext.data.activeTenant.tenantId;

  const myProfile = await getMyWorkforceStaffProfile(supabase, tenantId);
  if (myProfile.status !== 'success') return myProfile;
  if (!myProfile.data) return NO_STAFF_PROFILE_RESULT;

  return submitCorrectionRequestWrite(supabase, tenantId, {
    employeeId: myProfile.data.staffId,
    locationId: myProfile.data.locationId,
    workDate: input.workDate,
    attendanceId: input.attendanceId,
    details: input.message ? { message: input.message } : {},
  });
}

export async function decideCorrectionRequest(formData: FormData): Promise<WorkforceWriteResult<WorkforceShiftRequest>> {
  const input = parseDecideCorrectionRequestInput(formData);
  if (!input) return INVALID_INPUT_RESULT;

  const tenantContext = await requireTenantContext();
  if (tenantContext.status !== 'success') return tenantContext;

  const supabase = await createClient();
  return decideCorrectionRequestWrite(supabase, tenantContext.data.activeTenant.tenantId, input.requestId, input.decision);
}
