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
 *   - `blocked_by_history`: only ever returned by `permanentlyDeleteEmployee`
 *     -- the employee has one or more historical references (shifts,
 *     attendance, requests, exchanges) and the guarded
 *     `api.permanently_delete_employee` RPC (0056) refused to delete it.
 *   - `stale_reference`: the target row existed but is no longer in the
 *     state this write assumed -- returned by two distinct call sites, each
 *     with its own actionable-guidance meaning:
 *       - `decideShiftExchange('approved', ...)`: `api.decide_workforce_shift_exchange`
 *         (0050) re-validates the referenced shift/shift-type at decision
 *         time (still published and in the future; requested shift type
 *         still active; schedule still conflict-free) and raises one of five
 *         named exceptions (`shift_exchange_shift_changed`/
 *         `shift_exchange_replacement_required`/
 *         `shift_exchange_schedule_conflict`/`shift_change_type_unavailable`/
 *         `shift_change_location_unavailable`) if any of that has changed
 *         since the request was made -- confirmed by direct reproduction
 *         against a realistic request whose target shift's `starts_at` had
 *         since passed. All five collapse to this one status: the actionable
 *         guidance is identical for each ("refresh - this request no longer
 *         matches the current schedule"), never a distinct message per
 *         internal exception name.
 *       - `decideCorrectionRequest(...)`: the request existed but its
 *         `status` was no longer `pending` at decision time -- another
 *         manager already approved/rejected it in the race window between
 *         this manager loading the queue and submitting their own decision.
 *         The actionable guidance here is "refresh - this request was
 *         already decided", which is a different underlying cause than the
 *         shift-exchange case above; callers must not assume `stale_reference`
 *         always means "the shift changed."
 */
export type WorkforceWriteResult<T> =
  | TenantAccessResult<T>
  | { status: 'not_found' }
  | { status: 'duplicate'; message: string }
  | { status: 'blocked_by_history' }
  | { status: 'stale_reference' };
