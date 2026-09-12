import type { PostgrestError } from '@supabase/supabase-js';
import type { TenantAccessResult } from '@/lib/tenant/types';
import type { IssuesWriteResult } from './result-types';

/** 42501 = insufficient_privilege; PostgREST also surfaces "permission denied" / RLS also surfaces "row-level security". Same convention as `@/lib/operations/pg-error.ts`. */
function isPermissionError(error: PostgrestError): boolean {
  return error.code === '42501' || /permission denied|row-level security/i.test(error.message);
}

/**
 * Every `api.issues_*` RPC (0118) raises its named business-rule exceptions
 * as a plain `snake_case` message via `raise exception '<code>' using errcode
 * = 'P0001'` (e.g. `issues_invalid_kind`, `issues_permission_denied`,
 * `issues_not_open`) -- same message-matching convention as
 * `@/lib/operations/pg-error.ts`'s `OPERATIONS_ERROR_CODE_RE`, generalized so
 * a code this slice doesn't specifically know about still surfaces as a
 * mapped (if generic) error instead of falling through to
 * `unexpected_error`'s raw Postgres text.
 */
const ISSUES_ERROR_CODE_RE = /^issues_[a-z0-9_]+$/;

/** Shared read-path error mapping, matching `mapOperationsReadError`'s convention. */
export function mapIssuesReadError(error: PostgrestError, action: string): TenantAccessResult<never> {
  if (isPermissionError(error)) return { status: 'unauthorized', message: `Not permitted to ${action}.` };
  return { status: 'unexpected_error', message: error.message };
}

/** Shared write-path error mapping for every `api.issues_*` RPC call. */
export function mapIssuesWriteError(error: PostgrestError): IssuesWriteResult<never> {
  if (isPermissionError(error)) return { status: 'unauthorized', message: 'Not permitted to perform this action.' };
  if (ISSUES_ERROR_CODE_RE.test(error.message)) return { status: 'issues_error', code: error.message };
  return { status: 'unexpected_error', message: error.message };
}
