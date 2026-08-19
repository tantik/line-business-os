'use server';

import { createClient } from '@/lib/supabase/server';
import { requireTenantContext } from '@/lib/tenant/context';
import { parseUuid } from './validation';
import {
  parseBindEmployeeLineUserInput,
  parseSetEmployeeActiveInput,
  parseUnbindEmployeeLineUserInput,
  parseUpsertEmployeeInput,
} from './employees-input';
import {
  permanentlyDeleteEmployee,
  setWorkforceEmployeeActive,
  upsertWorkforceEmployee,
  type WorkforceEmployeeActiveState,
  type WorkforceStaffManageEntry,
} from './employees';
import {
  bindEmployeeLineUser as bindEmployeeLineUserWrite,
  unbindEmployeeLineUser as unbindEmployeeLineUserWrite,
  type UnbindEmployeeLineUserOutcome,
  type WorkforceEmployeeLineLinkBinding,
} from './employee-line-links';
import type { WorkforceWriteResult } from './result-types';

/**
 * Server Actions for staff profile management + LINE binding (manager-only;
 * enforced by RLS -- `wf_employees_staff_manage` / `wf_employee_line_links_manage`,
 * both `workforce.staff.manage`). Thin controllers: validate -> resolve tenant
 * -> delegate to the service-layer helpers in `employees.ts`/
 * `employee-line-links.ts`, which own the actual Supabase calls.
 */

const INVALID_INPUT_RESULT = { status: 'unexpected_error', message: 'Invalid input.' } as const;

export async function upsertEmployee(formData: FormData): Promise<WorkforceWriteResult<WorkforceStaffManageEntry>> {
  const input = parseUpsertEmployeeInput(formData);
  if (!input) return INVALID_INPUT_RESULT;

  const tenantContext = await requireTenantContext();
  if (tenantContext.status !== 'success') return tenantContext;

  const supabase = await createClient();
  return upsertWorkforceEmployee(supabase, tenantContext.data.activeTenant.tenantId, {
    id: input.id ?? undefined,
    locationId: input.locationId,
    name: input.name,
    familyName: input.familyName,
    givenName: input.givenName,
    email: input.email,
    notes: input.notes,
    positionLabel: input.positionLabel,
    employmentType: input.employmentType,
    isActive: input.isActive,
    hourlyWageYen: input.hourlyWageYen,
  });
}

export async function setEmployeeActive(formData: FormData): Promise<WorkforceWriteResult<WorkforceEmployeeActiveState>> {
  const input = parseSetEmployeeActiveInput(formData);
  if (!input) return INVALID_INPUT_RESULT;

  const tenantContext = await requireTenantContext();
  if (tenantContext.status !== 'success') return tenantContext;

  const supabase = await createClient();
  return setWorkforceEmployeeActive(supabase, tenantContext.data.activeTenant.tenantId, input.staffId, input.isActive);
}

/** Manager-only: permanently (physically) remove a staff profile. Distinct from `setEmployeeActive(..., false)` (the normal "Deactivate" path, which soft-deactivates and always preserves history) -- this refuses when the employee has any shift/attendance/request/exchange history, via the guarded `api.permanently_delete_employee` RPC (0056). */
export async function deleteEmployee(formData: FormData): Promise<WorkforceWriteResult<{ staffId: string }>> {
  const staffId = parseUuid(formData.get('staffId'));
  if (!staffId) return INVALID_INPUT_RESULT;

  const tenantContext = await requireTenantContext();
  if (tenantContext.status !== 'success') return tenantContext;

  const supabase = await createClient();
  return permanentlyDeleteEmployee(supabase, tenantContext.data.activeTenant.tenantId, staffId);
}

export async function bindEmployeeLineUser(formData: FormData): Promise<WorkforceWriteResult<WorkforceEmployeeLineLinkBinding>> {
  const input = parseBindEmployeeLineUserInput(formData);
  if (!input) return INVALID_INPUT_RESULT;

  const tenantContext = await requireTenantContext();
  if (tenantContext.status !== 'success') return tenantContext;

  const supabase = await createClient();
  return bindEmployeeLineUserWrite(supabase, tenantContext.data.activeTenant.tenantId, input.employeeId, input.rawLineUserId);
}

export async function unbindEmployeeLineUser(formData: FormData): Promise<WorkforceWriteResult<UnbindEmployeeLineUserOutcome>> {
  const input = parseUnbindEmployeeLineUserInput(formData);
  if (!input) return INVALID_INPUT_RESULT;

  const tenantContext = await requireTenantContext();
  if (tenantContext.status !== 'success') return tenantContext;

  const supabase = await createClient();
  return unbindEmployeeLineUserWrite(supabase, tenantContext.data.activeTenant.tenantId, input.employeeId);
}
