import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import type { TenantAccessResult } from '@/lib/tenant/types';

/** Flat row shape returned by `api.workforce_my_staff_profile`. */
interface ApiWorkforceMyStaffProfileRow {
  staff_id: string;
  tenant_id: string;
  location_id: string | null;
  position_label: string | null;
  employment_type: string;
  is_active: boolean;
  created_at: string;
}

export interface WorkforceMyStaffProfile {
  staffId: string;
  tenantId: string;
  locationId: string | null;
  positionLabel: string | null;
  employmentType: string;
  isActive: boolean;
  createdAt: string;
}

const MY_STAFF_PROFILE_SELECT =
  'staff_id, tenant_id, location_id, position_label, employment_type, is_active, created_at';

function mapPostgrestError(error: PostgrestError): TenantAccessResult<never> {
  // 42501 = insufficient_privilege; PostgREST also surfaces "permission denied".
  if (error.code === '42501' || /permission denied/i.test(error.message)) {
    return { status: 'unauthorized', message: 'Not permitted to read your workforce staff profile.' };
  }
  return { status: 'unexpected_error', message: error.message };
}

function mapProfileRow(row: ApiWorkforceMyStaffProfileRow): WorkforceMyStaffProfile {
  return {
    staffId: row.staff_id,
    tenantId: row.tenant_id,
    locationId: row.location_id,
    positionLabel: row.position_label,
    employmentType: row.employment_type,
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}

/**
 * Read the caller's own workforce staff profile through the app-facing API
 * facade, narrowed to the active tenant.
 *
 * `api.workforce_my_staff_profile` restates `wf_employees_self_read`'s
 * `user_id = core.current_user_id()` predicate directly, independent of any
 * `workforce.staff.*`/`workforce.recipe.*` permission grant; the `tenant_id`
 * filter here is a display narrowing only, not the security boundary.
 *
 * `data: null` means the caller has no matching `workforce.employees` row
 * (e.g. an Owner/Admin with no staff record) -- not an error.
 */
export async function getMyWorkforceStaffProfile(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<TenantAccessResult<WorkforceMyStaffProfile | null>> {
  try {
    const { data, error } = await supabase
      .schema('api')
      .from('workforce_my_staff_profile')
      .select(MY_STAFF_PROFILE_SELECT)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error) return mapPostgrestError(error);
    if (!data) return { status: 'success', data: null };

    return { status: 'success', data: mapProfileRow(data as ApiWorkforceMyStaffProfileRow) };
  } catch (err) {
    return {
      status: 'unexpected_error',
      message: err instanceof Error ? err.message : 'Unexpected error reading workforce staff profile.',
    };
  }
}
