'use server';

import { parseSetEmployeeActiveInput, parseUpsertEmployeeInput } from '@/lib/workforce/employees-input';
import {
  listWorkforceStaffDirectory,
  setWorkforceEmployeeActive,
  upsertWorkforceEmployee,
  type WorkforceEmployeeActiveState,
  type WorkforceStaffManageEntry,
} from '@/lib/workforce/employees';
import { resolvePreviewManagerContext } from './authorize';
import { mapWorkforceWriteResult, PREVIEW_INVALID_INPUT_RESULT, type PreviewWriteResult } from '../write-result';

/**
 * Phase 1N-4C Slice B2a - preview-specific manager Server Actions for
 * employee create/edit and activate/deactivate. Preview-only wrappers around
 * the existing, unchanged `employees.ts` service-layer functions - never
 * imports `staff-actions.ts` (the dashboard action module).
 *
 * Every wrapper: resolve strict tenant/module/location/permission
 * (`resolvePreviewManagerContext`) -> validate submitted target-record id(s)
 * against the strict tenant + resolved location -> call the existing
 * service-layer function -> map to the neutral `PreviewWriteResult`. No
 * `redirect()`, no `revalidatePath` - the calling client island refreshes via
 * `router.refresh()`.
 */

export async function previewUpsertEmployee(formData: FormData): Promise<PreviewWriteResult<WorkforceStaffManageEntry>> {
  const contextResult = await resolvePreviewManagerContext('workforce.staff.manage');
  if (contextResult.status !== 'ok') return contextResult.result;
  const { supabase, tenantId, locationId } = contextResult.context;

  // The server-resolved active location always wins - a submitted `locationId`
  // field (authority, never a legitimate target-record identifier here, B2
  // plan Section 3.0/8.1) is never read from the client; it is discarded and
  // replaced before the shared parser ever sees it.
  const scopedFormData = new FormData();
  for (const [key, value] of formData.entries()) {
    if (key === 'locationId') continue;
    scopedFormData.append(key, value);
  }
  scopedFormData.set('locationId', locationId);

  const input = parseUpsertEmployeeInput(scopedFormData);
  if (!input) return PREVIEW_INVALID_INPUT_RESULT;

  if (input.id) {
    const directoryResult = await listWorkforceStaffDirectory(supabase, tenantId);
    if (directoryResult.status !== 'success') return { status: 'unexpected_error' };
    const target = directoryResult.data.find((s) => s.staffId === input.id);
    if (!target || target.locationId !== locationId) return { status: 'not_found' };
  }

  const result = await upsertWorkforceEmployee(supabase, tenantId, {
    id: input.id ?? undefined,
    locationId,
    name: input.name,
    positionLabel: input.positionLabel,
    employmentType: input.employmentType,
    hourlyWageYen: input.hourlyWageYen,
    isActive: input.isActive,
  });
  return mapWorkforceWriteResult(result);
}

export async function previewSetEmployeeActive(
  formData: FormData,
): Promise<PreviewWriteResult<WorkforceEmployeeActiveState>> {
  const contextResult = await resolvePreviewManagerContext('workforce.staff.manage');
  if (contextResult.status !== 'ok') return contextResult.result;
  const { supabase, tenantId, locationId } = contextResult.context;

  const input = parseSetEmployeeActiveInput(formData);
  if (!input) return PREVIEW_INVALID_INPUT_RESULT;

  const directoryResult = await listWorkforceStaffDirectory(supabase, tenantId);
  if (directoryResult.status !== 'success') return { status: 'unexpected_error' };
  const target = directoryResult.data.find((s) => s.staffId === input.staffId);
  if (!target || target.locationId !== locationId) return { status: 'not_found' };

  const result = await setWorkforceEmployeeActive(supabase, tenantId, input.staffId, input.isActive);
  return mapWorkforceWriteResult(result);
}
