'use server';

import { requireTenantContext } from '@/lib/tenant/context';
import { createClient } from '@/lib/supabase/server';
import { requireActiveLocation } from '@/lib/tenant/active-location.server';
import { getWeekPeriod } from '@/lib/workforce/period';
import { addIsoDays, localDateTimeToUtcIso } from '@/lib/workforce/timezone';
import type { TenantAccessResult } from '@/lib/tenant/types';
import { hasWeeklyReviewAccess } from './access';
import { getWeeklyReviewSummary, type WeeklyReviewSummary } from './weekly-review';

/**
 * Owner Weekly Review server action (Cafe v2.2 WP3). Deliberately a
 * `'use server'` action rather than server-fetched page props (the pattern
 * every other dashboard popup uses): Prev/Next week navigation needs a fresh
 * read per week WITHOUT a full-page `router.refresh()`/reload, and this
 * codebase already has an established precedent for a read-only `'use
 * server'` action resolving its own tenant/location context
 * (`previewGetManagerTodaySignals`) rather than threading a page-level
 * `searchParams` week offset through the whole ~16-item Manager page data
 * batch the way `/manager?weekOffset=` does for the Schedule grid (that
 * pattern reruns the ENTIRE page's data batch per click -- see
 * `manager-dashboard-client.tsx`'s own Round 3 perf note -- overkill for a
 * popup that only needs its own five-domain summary).
 *
 * Resolves the SAME active store `/manager/page.tsx` uses
 * (`getActiveLocation`, DEBT-139 L2) -- never a silent fallback to an
 * arbitrary location.
 */

/** Sanity cap, not a business rule -- a Manager can look back at most one year. */
const MIN_WEEK_OFFSET = -52;
/** "forward up to and including the currently-in-progress week" (mission contract) -- never a future, not-yet-started week. */
const MAX_WEEK_OFFSET = 0;

export interface WeeklyReviewWeek {
  periodStart: string;
  periodEnd: string;
  weekOffset: number;
  /** True when this is the current, still-running business week -- the caller must present it as "in progress, not yet complete," never as a closed review. */
  isInProgress: boolean;
  summary: WeeklyReviewSummary;
}

export async function getWeeklyReviewAction(weekOffsetRaw: number): Promise<TenantAccessResult<WeeklyReviewWeek>> {
  const contextResult = await requireTenantContext();
  if (contextResult.status !== 'success') return contextResult;
  const { activeTenant } = contextResult.data;
  const supabase = await createClient();

  // DEBT-139 L2: the same ACTIVE store `/manager` shows; fails closed when
  // there is none -- never an arbitrary location.
  const activeLocation = await requireActiveLocation(activeTenant.tenantId, activeTenant.locationId);
  if (activeLocation.status !== 'success') return activeLocation;
  const { location } = activeLocation.data;

  const hasAccess = await hasWeeklyReviewAccess(supabase, activeTenant.tenantId, location.locationId);
  if (!hasAccess) return { status: 'unauthorized', message: 'Not permitted to view the Weekly Review.' };

  const weekOffset = Math.max(MIN_WEEK_OFFSET, Math.min(MAX_WEEK_OFFSET, Math.trunc(weekOffsetRaw) || 0));
  const nowIso = new Date().toISOString();
  const { periodStart, periodEnd } = getWeekPeriod(nowIso, location.timezone, weekOffset);
  const currentWeek = getWeekPeriod(nowIso, location.timezone, 0);
  const isInProgress = periodStart === currentWeek.periodStart;

  const weekStartsAt = localDateTimeToUtcIso(periodStart, '00:00', location.timezone);
  const weekEndsAtExclusive = localDateTimeToUtcIso(addIsoDays(periodEnd, 1), '00:00', location.timezone);

  const summaryResult = await getWeeklyReviewSummary(
    supabase,
    activeTenant.tenantId,
    location.locationId,
    periodStart,
    periodEnd,
    weekStartsAt,
    weekEndsAtExclusive,
  );
  if (summaryResult.status !== 'success') return summaryResult;

  return {
    status: 'success',
    data: { periodStart, periodEnd, weekOffset, isInProgress, summary: summaryResult.data },
  };
}
