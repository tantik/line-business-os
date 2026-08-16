import type { PostgrestError } from '@supabase/supabase-js';
import type { TenantAccessResult } from '@/lib/tenant/types';
import type { WorkforceWriteResult } from './result-types';

/** 42501 = insufficient_privilege; PostgREST also surfaces "permission denied" / RLS also surfaces "row-level security". */
function isPermissionError(error: PostgrestError): boolean {
  return error.code === '42501' || /permission denied|row-level security/i.test(error.message);
}

/** Shared read-path error mapping, matching the convention in staff-profile.ts/recipes.ts/admin-members.ts. */
export function mapWorkforceReadError(error: PostgrestError, action: string): TenantAccessResult<never> {
  if (isPermissionError(error)) return { status: 'unauthorized', message: `Not permitted to ${action}.` };
  return { status: 'unexpected_error', message: error.message };
}

/** Shared write-path error mapping: adds a `duplicate` outcome for unique-constraint violations (23505). */
export function mapWorkforceWriteError(error: PostgrestError, action: string): WorkforceWriteResult<never> {
  if (isPermissionError(error)) return { status: 'unauthorized', message: `Not permitted to ${action}.` };
  if (error.code === '23505') return { status: 'duplicate', message: `${action} conflicts with an existing record.` };
  return { status: 'unexpected_error', message: error.message };
}
