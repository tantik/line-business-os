import type { PostgrestError } from '@supabase/supabase-js';
import type { TenantAccessResult } from '@/lib/tenant/types';

/** 42501 = insufficient_privilege; PostgREST also surfaces "permission denied" / RLS also surfaces "row-level security". Never surfaced verbatim to the client -- callers map this to a generic, user-facing message. */
function isPermissionError(error: PostgrestError): boolean {
  return error.code === '42501' || /permission denied|row-level security/i.test(error.message);
}

export function mapInventoryReadError(error: PostgrestError, action: string): TenantAccessResult<never> {
  if (isPermissionError(error)) return { status: 'unauthorized', message: `Not permitted to ${action}.` };
  return { status: 'unexpected_error', message: 'Unable to load inventory data right now.' };
}

export function mapInventoryWriteError(error: PostgrestError, action: string): TenantAccessResult<never> {
  if (isPermissionError(error)) return { status: 'unauthorized', message: `Not permitted to ${action}.` };
  return { status: 'unexpected_error', message: `Unable to ${action} right now.` };
}
