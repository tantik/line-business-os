import type { PostgrestError } from '@supabase/supabase-js';
import type { TenantAccessResult } from '@/lib/tenant/types';
import type { OperationsWriteResult } from './result-types';

/** 42501 = insufficient_privilege; PostgREST also surfaces "permission denied" / RLS also surfaces "row-level security". Same convention as `@/lib/workforce/pg-error.ts`. */
function isPermissionError(error: PostgrestError): boolean {
  return error.code === '42501' || /permission denied|row-level security/i.test(error.message);
}

/**
 * Every `api.operations_*` configuration RPC (0105) raises its named
 * business-rule exceptions as a plain `snake_case` message via
 * `raise exception '<code>' using errcode = 'P0001'` (e.g.
 * `operations_template_name_required`, `operations_permission_denied`,
 * `operations_item_definition_frozen_after_operational`) -- the same
 * message-matching convention `shift-exchanges.ts`'s
 * `STALE_SHIFT_EXCHANGE_REFERENCE_MESSAGES` already uses, generalized to a
 * pattern instead of an explicit list so a code this slice doesn't
 * specifically know about still surfaces as a mapped (if generic) error
 * instead of falling through to `unexpected_error`'s raw Postgres text.
 */
const OPERATIONS_ERROR_CODE_RE = /^operations_[a-z0-9_]+$/;

/** Shared read-path error mapping, matching `mapWorkforceReadError`'s convention. */
export function mapOperationsReadError(error: PostgrestError, action: string): TenantAccessResult<never> {
  if (isPermissionError(error)) return { status: 'unauthorized', message: `Not permitted to ${action}.` };
  return { status: 'unexpected_error', message: error.message };
}

/** Shared write-path error mapping for every `api.operations_*` RPC call. */
export function mapOperationsWriteError(error: PostgrestError): OperationsWriteResult<never> {
  if (isPermissionError(error)) return { status: 'unauthorized', message: 'Not permitted to perform this action.' };
  if (OPERATIONS_ERROR_CODE_RE.test(error.message)) return { status: 'operations_error', code: error.message };
  return { status: 'unexpected_error', message: error.message };
}
