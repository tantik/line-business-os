'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import type { WorkforceStaffManageEntry } from '@/lib/workforce/employees';
import type { WorkforceShiftType } from '@/lib/workforce/shift-types';
import type { WorkforceShiftAssignment } from '@/lib/workforce/shift-assignments';
import type { WorkforceAttendance } from '@/lib/workforce/attendance';
import { estimatedEarningsSummary } from '@/lib/workforce/estimated-earnings';
import { addIsoDays } from '@/lib/workforce/timezone';
import { todayIsoInTimeZone } from '@/app/(protected)/dashboard/workforce/_ui/workforce-theme';
import { PreviewShiftGrid } from './preview-shift-grid';
import { PreviewScheduleCardActions } from './preview-schedule-card-actions';
import { previewGetScheduleWeek } from './actions/schedule-actions';
import { DemoHelpButton } from '@/components/demo/cafe/DemoHelpButton';
import { HELP_MANAGER_MONTHLY_REPORT, HELP_MANAGER_SHIFT_TABLE } from '@/lib/demo/cafe/helpContent';
import { formatMonthDay } from '@/lib/demo/cafe/format';
import { buttonDisabled, buttonSecondary, card, demoColors, mutedText, shiftChipColors, shiftChipStyle } from '@/lib/demo/cafe/theme';
import { toManagerViewShiftTypes } from './manager-view-model';
import { useLang } from '@/lib/demo/cafe/i18n';
import { tManager } from '@/lib/demo/cafe/i18n.manager';

/**
 * `'use client'` chrome for the manager シフト表 card -- split out of
 * `manager-view.tsx` specifically so it can call `useLang()`.
 * `preview-action-free.test.ts` hard-asserts that `manager-view.tsx` is NEVER
 * a client component (a structural "no client bundle => no possible Server
 * Action registration" guarantee, stricter than the manifest check alone) --
 * this file exists so that invariant can stay true while still supporting
 * i18n. `manager-view.tsx`'s `PreviewManagerView` is now a bare pass-through
 * to this component; all rendering logic lives here.
 *
 * Preview Manager architecture (perf phase 2): this component owns the
 * currently-displayed week's data (`schedule` state below), seeded from the
 * initial page load's props. Week prev/today/next and the auto-distribute/
 * publish actions all refresh that state via the scoped, read-only
 * `previewGetScheduleWeek()` Server Action - never `router.push`/
 * `router.refresh()`. That means changing week (or a schedule write) never
 * navigates, never resets scroll, and never re-runs the whole Manager page's
 * auth chain + 11-query batch (which would also re-render Inventory/Staff/
 * Recipes/Settings/Shift Exchange for no reason - none of their data
 * changed).
 */
export interface PreviewManagerViewChromeProps {
  timeZone: string;
  periodStart: string;
  periodEnd: string;
  weekOffset: number;
  staff: WorkforceStaffManageEntry[] | null;
  shiftTypes: WorkforceShiftType[] | null;
  assignments: WorkforceShiftAssignment[] | null;
  attendance: WorkforceAttendance[] | null;
  basePath: string;
  /** Week-independent (per-location schedule settings); passed straight to `PreviewScheduleCardActions`, rendered directly by this component instead of via a server-prebuilt `actionsSlot` (which could not react to a client-only week change). */
  requiredHeadcountByWeekday: number[];
}

function weekDates(periodStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addIsoDays(periodStart, i));
}

const MIN_WEEK_OFFSET = -8;
const MAX_WEEK_OFFSET = 8;

export function PreviewManagerViewChrome({
  timeZone,
  periodStart,
  periodEnd,
  weekOffset,
  staff,
  shiftTypes,
  assignments,
  attendance,
  basePath,
  requiredHeadcountByWeekday,
}: PreviewManagerViewChromeProps) {
  const { lang } = useLang();
  const t = (key: Parameters<typeof tManager>[1]) => tManager(lang, key);
  const [isNavigating, startNavigation] = useTransition();
  const [schedule, setSchedule] = useState({
    periodStart,
    periodEnd,
    weekOffset,
    assignments: assignments ?? [],
  });

  // Client-side week cache (perf phase 4): once a week's data has been fetched
  // (initial load or a prior navigation), switching back to it renders
  // immediately from cache instead of waiting on a network round trip -- a
  // background revalidate still runs so a cached week never goes stale
  // forever, it just never blocks the switch. Seeded with the initial page
  // load's own week so navigating away and back to it is instant even before
  // any prefetch has landed.
  type ScheduleWeek = typeof schedule;
  const weekCacheRef = useRef(new Map<number, ScheduleWeek>([[weekOffset, { periodStart, periodEnd, weekOffset, assignments: assignments ?? [] }]]));
  // The most recently requested week -- a slow prefetch/revalidate for a week
  // the manager has since navigated away from must never overwrite whatever
  // week is on screen now.
  const currentOffsetRef = useRef(weekOffset);

  async function fetchWeek(targetOffset: number): Promise<ScheduleWeek | null> {
    const result = await previewGetScheduleWeek(targetOffset);
    return result.status === 'success' ? result.data : null;
  }

  useEffect(() => {
    // Prefetch the two adjacent weeks in the background after the current
    // week has rendered, so a Prev/Next click right after landing on the
    // page is already cached. Never prefetches out of the -8..+8 bound, and
    // never re-fetches a week already in the cache (including one a prior
    // prefetch already landed).
    for (const adjacent of [currentOffsetRef.current - 1, currentOffsetRef.current + 1]) {
      if (adjacent < MIN_WEEK_OFFSET || adjacent > MAX_WEEK_OFFSET) continue;
      if (weekCacheRef.current.has(adjacent)) continue;
      fetchWeek(adjacent).then((week) => {
        if (week) weekCacheRef.current.set(adjacent, week);
      });
    }
  }, [schedule.weekOffset]);

  const dates = weekDates(schedule.periodStart);
  const todayIso = todayIsoInTimeZone(timeZone);
  const monthPrefix = todayIso.slice(0, 7);
  const monthlySummaries = Object.fromEntries((staff ?? []).map((entry) => [
    entry.staffId,
    estimatedEarningsSummary((attendance ?? []).filter((row) => row.employeeId === entry.staffId), monthPrefix, entry.hourlyWageYen),
  ]));
  const estimatedLabourCost = Object.values(monthlySummaries).reduce((sum, item) => sum + (item.estimatedEarningsYen ?? 0), 0);
  const managerLegendShiftTypes = (shiftTypes ?? []).filter(
    (shiftType) =>
      shiftType.isActive ||
      schedule.assignments.some(
        (assignment) => assignment.employeeId && assignment.shiftTypeId === shiftType.shiftTypeId,
      ),
  );

  function weekHref(targetOffset: number) {
    return targetOffset === 0 ? `${basePath}/manager` : `${basePath}/manager?weekOffset=${targetOffset}`;
  }

  /** Always used for a schedule-write refresh (auto-distribute/publish/shift edit) - the current week's cache entry must reflect its own latest write, never a stale pre-write snapshot. */
  async function refreshWeek(targetOffset: number) {
    const week = await fetchWeek(targetOffset);
    if (week && currentOffsetRef.current === targetOffset) {
      weekCacheRef.current.set(targetOffset, week);
      setSchedule(week);
    }
  }

  function navigateToWeek(targetOffset: number) {
    if (targetOffset === schedule.weekOffset || targetOffset < MIN_WEEK_OFFSET || targetOffset > MAX_WEEK_OFFSET) return;
    currentOffsetRef.current = targetOffset;
    window.history.replaceState(null, '', weekHref(targetOffset));

    const cached = weekCacheRef.current.get(targetOffset);
    if (cached) {
      // Cached week: render immediately, no loader, no waiting on the
      // network - then silently revalidate in the background in case the
      // schedule changed since it was cached. A slower revalidate that
      // resolves after the manager has already navigated elsewhere again is
      // dropped by the `currentOffsetRef` check in `refreshWeek`, never
      // overwriting whatever week is on screen by then.
      setSchedule(cached);
      refreshWeek(targetOffset);
      return;
    }

    // Not cached: same loader-visible path as before while the fetch is
    // in flight, but the result is now cached for next time.
    startNavigation(async () => {
      await refreshWeek(targetOffset);
    });
  }

  return (
    <section style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <strong style={{ fontSize: 16 }}>{t('shiftTable')}</strong>
          <DemoHelpButton content={HELP_MANAGER_SHIFT_TABLE} />
        </div>
        <PreviewScheduleCardActions
          periodStart={schedule.periodStart}
          periodEnd={schedule.periodEnd}
          requiredHeadcountByWeekday={requiredHeadcountByWeekday}
          hasUnpublishedChanges={schedule.assignments.some((assignment) => !assignment.published)}
          onScheduleChanged={() => refreshWeek(schedule.weekOffset)}
        />
      </div>

      <p style={{ margin: '8px 0 4px', fontSize: 12.5, ...mutedText }}>
        {t('shiftTableHelp')}
      </p>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, margin: '12px 0' }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: demoColors.textPrimary }}>
          {formatMonthDay(new Date(`${schedule.periodStart}T00:00:00`))} 〜 {formatMonthDay(new Date(`${schedule.periodEnd}T00:00:00`))}
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => navigateToWeek(schedule.weekOffset - 1)} disabled={isNavigating || schedule.weekOffset <= MIN_WEEK_OFFSET} style={isNavigating || schedule.weekOffset <= MIN_WEEK_OFFSET ? buttonDisabled : buttonSecondary}>
            ← {t('prevWeek')}
          </button>
          <button
            type="button"
            onClick={() => navigateToWeek(0)}
            disabled={schedule.weekOffset === 0 || isNavigating}
            style={schedule.weekOffset === 0 ? buttonDisabled : buttonSecondary}
            aria-disabled={schedule.weekOffset === 0}
          >
            {t('today')}
          </button>
          <button type="button" onClick={() => navigateToWeek(schedule.weekOffset + 1)} disabled={isNavigating || schedule.weekOffset >= MAX_WEEK_OFFSET} style={isNavigating || schedule.weekOffset >= MAX_WEEK_OFFSET ? buttonDisabled : buttonSecondary}>
            {t('nextWeek')} →
          </button>
        </div>
      </div>

      <div
        aria-hidden={!isNavigating}
        style={{
          height: 3,
          margin: '-3px 0 7px',
          borderRadius: 999,
          overflow: 'hidden',
          background: isNavigating ? demoColors.border : 'transparent',
          opacity: isNavigating ? 1 : 0,
          transition: 'opacity 140ms ease',
        }}
      >
        <div style={{ width: '42%', height: '100%', borderRadius: 999, background: demoColors.accent }} />
      </div>

      {staff === null ? (
        <p style={{ margin: '12px 0 0', ...mutedText }}>{t('staffListLoadError')}</p>
      ) : staff.length === 0 ? (
        <p style={{ margin: '12px 0 0', ...mutedText }}>{t('staffListEmpty')}</p>
      ) : (
        <div
          aria-busy={isNavigating}
          style={{
            marginTop: 12,
            minHeight: 320,
            opacity: isNavigating ? 0.72 : 1,
            transition: 'opacity 140ms ease',
          }}
        >
          <PreviewShiftGrid
            dates={dates}
            todayIso={todayIso}
            timeZone={timeZone}
            staff={staff}
            assignments={schedule.assignments}
            shiftTypes={shiftTypes === null ? [] : shiftTypes}
            monthlySummaries={monthlySummaries}
            onAssignmentsChanged={(next) => {
              setSchedule((prev) => {
                const updated = { ...prev, assignments: next };
                // Keep the cache entry for the current week in sync with a
                // direct per-shift edit, too -- otherwise navigating away and
                // back would render the pre-edit cached snapshot instead of
                // this just-made change.
                weekCacheRef.current.set(prev.weekOffset, updated);
                return updated;
              });
            }}
          />
        </div>
      )}

      {managerLegendShiftTypes.length > 0 ? (
        <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: '6px 14px' }}>
          {(() => {
            const legendTypes = toManagerViewShiftTypes(managerLegendShiftTypes);
            const legendIds = legendTypes.map((t) => t.id);
            return legendTypes.map((type) => {
              const chip = shiftChipColors(type.id, legendIds);
              return (
                <div key={type.id} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={shiftChipStyle(chip.background, chip.color, true)}>{type.label}</span>
                  <span style={{ fontSize: 11, color: demoColors.textMuted }}>
                    {type.startTime}-{type.endTime}
                  </span>
                </div>
              );
            });
          })()}
        </div>
      ) : null}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
        <div style={{ padding: '8px 12px', borderRadius: 9, background: demoColors.surfaceElevated, textAlign: 'right' }}>
          <span style={{ display: 'block', fontSize: 11.5, color: demoColors.textMuted }}>{lang === 'ja' ? '概算人件費' : 'Estimated labour cost'}</span>
          <strong style={{ fontSize: 18 }}>¥{estimatedLabourCost.toLocaleString('ja-JP')}</strong>
          <span style={{ display: 'block', fontSize: 10.5, color: demoColors.textMuted }}>{lang === 'ja' ? '給与計算ではありません' : 'Operational estimate, not payroll'}</span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, marginTop: 12 }}>
        <button type="button" style={buttonSecondary} disabled title={t('monthlyReportComingSoon')}>
          {t('monthlyReportCsv')}
        </button>
        <DemoHelpButton content={HELP_MANAGER_MONTHLY_REPORT} />
      </div>
    </section>
  );
}
