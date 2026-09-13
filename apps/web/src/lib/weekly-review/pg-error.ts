import type { PostgrestError } from '@supabase/supabase-js';
import type { TenantAccessResult } from '@/lib/tenant/types';

/** 42501 = insufficient_privilege; PostgREST also surfaces "permission denied" / RLS also surfaces "row-level security". Same convention as `@/lib/issues/pg-error.ts` / `@/lib/operations/pg-error.ts`. */
function isPermissionError(error: PostgrestError): boolean {
  return error.code === '42501' || /permission denied|row-level security/i.test(error.message);
}

/**
 * `api.weekly_review_summary` (0119) raises its named business-rule
 * exceptions as a plain `snake_case` message via `raise exception '<code>'
 * using errcode = 'P0001'` (e.g. `weekly_review_permission_denied`,
 * `weekly_review_invalid_week`) -- same convention as
 * `@/lib/issues/pg-error.ts`'s `ISSUES_ERROR_CODE_RE`.
 */
export function mapWeeklyReviewReadError(error: PostgrestError, action: string): TenantAccessResult<never> {
  if (isPermissionError(error)) return { status: 'unauthorized', message: `Not permitted to ${action}.` };
  if (error.message === 'weekly_review_permission_denied') {
    return { status: 'unauthorized', message: `Not permitted to ${action}.` };
  }
  return { status: 'unexpected_error', message: error.message };
}
