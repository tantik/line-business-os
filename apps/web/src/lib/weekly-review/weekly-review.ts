import type { SupabaseClient } from '@supabase/supabase-js';
import type { TenantAccessResult } from '@/lib/tenant/types';
import { mapWeeklyReviewReadError } from './pg-error';

/**
 * Owner Weekly Review read-model client (Cafe v2.2 WP3). Calls
 * `api.weekly_review_summary` (0119, `SECURITY INVOKER`) -- a single JSON
 * aggregation RPC, not a table read, so there is no `api.from(...)` call
 * here, only `api.rpc(...)`. Mirrors `@/lib/issues/issues.ts`'s exact
 * shape/conventions (typed row mapping, a dedicated `pg-error.ts`).
 *
 * Every domain section is `null` (not a zero-filled object) when that
 * domain's module is OFF for the tenant -- see the migration's own
 * "missing != 0" note. Callers must render that distinctly from a real
 * all-zero section (a genuinely quiet week).
 */

export interface WeeklyReviewWorkforceSection {
  shiftAssignmentsCount: number;
  shiftExchangesCount: number;
  /** Still-pending shift requests as of now -- NOT scoped to this week (may predate it). */
  unresolvedShiftRequestsCount: number;
}

export interface WeeklyReviewOperationsSection {
  completedCount: number;
  criticalMissedCount: number;
  /** Still-open exceptions as of now -- NOT scoped to this week (may predate it). */
  openExceptionsCount: number;
}

export interface WeeklyReviewRecurringCategory {
  category: string;
  count: number;
}

export interface WeeklyReviewIssuesSection {
  newIssuesCount: number;
  newHandoversCount: number;
  /** Still-unresolved (open/acknowledged) issues as of now -- NOT scoped to this week. */
  unresolvedIssuesCount: number;
  /** Still-unresolved AND severity=important issues as of now. */
  unresolvedImportantIssuesCount: number;
  /** Categories appearing 2+ times among this week's new issues -- a plain factual count, no causality language. */
  recurringCategories: WeeklyReviewRecurringCategory[];
}

export interface WeeklyReviewPurchasingSection {
  /** Live state, not week-scoped -- inventory has no history. */
  shortageItemsCount: number;
  pendingPurchasesCount: number;
}

export interface WeeklyReviewSummary {
  weekStart: string;
  weekEnd: string;
  workforce: WeeklyReviewWorkforceSection | null;
  operations: WeeklyReviewOperationsSection | null;
  issues: WeeklyReviewIssuesSection | null;
  purchasing: WeeklyReviewPurchasingSection | null;
}

/** Raw JSON shape returned by `api.weekly_review_summary` -- same field names as the TS interfaces above (the RPC already returns camelCase keys), so this is a pass-through type, not a distinct snake_case row. */
type ApiWeeklyReviewSummary = WeeklyReviewSummary;

/**
 * Read the Weekly Review summary for one tenant+location+week. The caller
 * (a `'use server'` action, see `weekly-review-actions.ts`) is responsible
 * for resolving the location and its UTC week-boundary instants -- this
 * function only calls the RPC and maps its result/errors.
 */
export async function getWeeklyReviewSummary(
  supabase: SupabaseClient,
  tenantId: string,
  locationId: string,
  weekStart: string,
  weekEnd: string,
  weekStartsAt: string,
  weekEndsAtExclusive: string,
): Promise<TenantAccessResult<WeeklyReviewSummary>> {
  try {
    const { data, error } = await supabase.schema('api').rpc('weekly_review_summary', {
      p_tenant_id: tenantId,
      p_location_id: locationId,
      p_week_start: weekStart,
      p_week_end: weekEnd,
      p_week_starts_at: weekStartsAt,
      p_week_ends_at_exclusive: weekEndsAtExclusive,
    });
    if (error) return mapWeeklyReviewReadError(error, 'read the Weekly Review');
    return { status: 'success', data: data as ApiWeeklyReviewSummary };
  } catch (err) {
    return {
      status: 'unexpected_error',
      message: err instanceof Error ? err.message : 'Unexpected error reading the Weekly Review.',
    };
  }
}
