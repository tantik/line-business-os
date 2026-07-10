import type { TenantAccessResult } from '@/lib/tenant/types';

/**
 * Shared discriminated result shape for every workforce write helper in this
 * slice. Extends the existing `TenantAccessResult` status set (`success`,
 * `unauthorized`, `config_error`, `unexpected_error`) with two write-specific
 * outcomes that never apply to a read:
 *   - `not_found`: the target row doesn't exist, isn't visible under RLS to
 *     this caller, or doesn't belong to the active tenant -- these are
 *     indistinguishable at the query layer (RLS filters rows, it does not
 *     reject the request), so a zero-row UPDATE/SELECT-after-write is always
 *     reported as `not_found`, never as an error.
 *   - `duplicate`: a unique-constraint violation (Postgres `23505`), e.g.
 *     rebinding a LINE user id already bound elsewhere, or a second
 *     `preference`-kind shift request for the same employee/day.
 */
export type WorkforceWriteResult<T> =
  | TenantAccessResult<T>
  | { status: 'not_found' }
  | { status: 'duplicate'; message: string };
