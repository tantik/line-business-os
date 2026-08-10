'use client';

import { useMemo, useRef, useState } from 'react';
import type { WorkforceStaffManageEntry } from '@/lib/workforce/employees';
import type { WorkforceShiftType } from '@/lib/workforce/shift-types';
import type { WorkforceShiftAssignment } from '@/lib/workforce/shift-assignments';
import type { WorkforceAttendance } from '@/lib/workforce/attendance';
import { estimatedEarningsSummary } from '@/lib/workforce/estimated-earnings';
import { addIsoDays, utcIsoToLocalDateTime } from '@/lib/workforce/timezone';
import { todayIsoInTimeZone } from '@/app/(protected)/dashboard/workforce/_ui/workforce-theme';
import { PreviewShiftGrid } from './preview-shift-grid';
import { PreviewScheduleCardActions } from './preview-schedule-card-actions';
import { previewGetScheduleWeek } from './actions/schedule-actions';
import { DemoHelpButton } from '@/components/demo/cafe/DemoHelpButton';
import { HELP_MANAGER_MONTHLY_REPORT, HELP_MANAGER_SHIFT_TABLE } from '@/lib/demo/cafe/helpContent';
import { formatMonthDay } from '@/lib/demo/cafe/format';
import { buttonDisabled, buttonSecondary, card, demoColors, mutedText, shiftChipColors, shiftChipStyle } from '@/lib/demo/cafe/theme';
import { computeManagerShortageDateSet, toManagerViewAssignments, toManagerViewShiftTypes } from './manager-view-model';
import { useLang } from '@/lib/demo/cafe/i18n';
import { tManager } from '@/lib/demo/cafe/i18n.manager';
import { WeekRefreshController } from './week-refresh-controller';
import type { PreviewScheduleWeek } from './actions/schedule-actions';

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
 * Preview Manager architecture (perf phase 3): this component owns the
 * currently-displayed week's data, derived client-side (no network request)
 * from a preloaded ±8-week `allAssignments` window - the same pattern
 * `PreviewStaffSchedule` already used for Staff week navigation. Plain
 * prev/today/next clicks are now a pure client-side date-range filter, same
 * as Staff; only the auto-distribute/publish actions (which mutate
 * server-side beyond what the client knows) still call the scoped, read-only
 * `previewGetScheduleWeek()` Server Action, merging the fresh week back into
 * the cached window instead of replacing it. Neither path ever
 * `router.push`/`router.refresh()`s, so changing week (or a schedule write)
 * never navigates, never resets scroll, and never re-runs the whole Manager
 * page's auth chain + query batch.
 */
export interface PreviewManagerViewChromeProps {
  timeZone: string;
  periodStart: string;
  periodEnd: string;
  weekOffset: number;
  staff: WorkforceStaffManageEntry[] | null;
  shiftTypes: WorkforceShiftType[] | null;
  /** Current week's assignments - used only as a fallback seed when `allAssignments` failed to load. */
  assignments: WorkforceShiftAssignment[] | null;
  /** Preloaded ±8-week assignment window (the same range the client navigator can reach) - powers instant, network-free week navigation exactly like `PreviewStaffSchedule`. */
  allAssignments: WorkforceShiftAssignment[] | null;
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
  allAssignments,
  attendance,
  basePath,
  requiredHeadcountByWeekday,
}: PreviewManagerViewChromeProps) {
  const { lang } = useLang();
  const t = (key: Parameters<typeof tManager>[1]) => tManager(lang, key);
  const [activeWeekOffset, setActiveWeekOffset] = useState(weekOffset);
  // The full ±8-week assignment window (same range the client navigator can
  // reach), seeded once from the initial page load's props. Plain week
  // navigation below filters this client-side - no network request, exactly
  // like `PreviewStaffSchedule`'s `goToWeek`. Only a forced refresh (after a
  // publish/auto-distribute mutation) re-fetches one week from the server and
  // splices it back in here.
  const [windowAssignments, setWindowAssignments] = useState(allAssignments ?? assignments ?? []);

  const activePeriodStart = addIsoDays(periodStart, (activeWeekOffset - weekOffset) * 7);
  const activePeriodEnd = addIsoDays(periodEnd, (activeWeekOffset - weekOffset) * 7);
  const dates = useMemo(() => weekDates(activePeriodStart), [activePeriodStart]);
  const dateSet = useMemo(() => new Set(dates), [dates]);
  const weekAssignments = useMemo(
    () => windowAssignments.filter((a) => dateSet.has(utcIsoToLocalDateTime(a.startsAt, timeZone).workDate)),
    [windowAssignments, dateSet, timeZone],
  );

  // The stale-response/dedup/forced-replay state machine (see
  // `week-refresh-controller.ts` for the full invariant/rationale doc and its
  // own deterministic tests) - one instance per mount, never recreated across
  // re-renders. Only used for the post-mutation forced refresh now; plain
  // navigation no longer goes through it.
  const controllerRef = useRef<WeekRefreshController<PreviewScheduleWeek> | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = new WeekRefreshController<PreviewScheduleWeek>(weekOffset, {
      fetchWeek: previewGetScheduleWeek,
      onApply: (data) => {
        const fetchedDateSet = new Set(weekDates(data.periodStart));
        setWindowAssignments((prev) => [
          ...prev.filter((a) => !fetchedDateSet.has(utcIsoToLocalDateTime(a.startsAt, timeZone).workDate)),
          ...data.assignments,
        ]);
      },
    });
  }
  const controller = controllerRef.current;

  const todayIso = todayIsoInTimeZone(timeZone);
  const monthPrefix = todayIso.slice(0, 7);
  const monthlySummaries = Object.fromEntries((staff ?? []).map((entry) => [
    entry.staffId,
    estimatedEarningsSummary((attendance ?? []).filter((row) => row.employeeId === entry.staffId), monthPrefix, entry.hourlyWageYen),
  ]));
  const estimatedLabourCost = Object.values(monthlySummaries).reduce((sum, item) => sum + (item.estimatedEarningsYen ?? 0), 0);
  const shortageDateSet = computeManagerShortageDateSet(
    dates,
    toManagerViewAssignments(weekAssignments, timeZone),
    shiftTypes ?? [],
    requiredHeadcountByWeekday,
  );
  const managerLegendShiftTypes = (shiftTypes ?? []).filter(
    (shiftType) =>
      shiftType.isActive ||
      weekAssignments.some(
        (assignment) => assignment.employeeId && assignment.shiftTypeId === shiftType.shiftTypeId,
      ),
  );

  function weekHref(targetOffset: number) {
    return targetOffset === 0 ? `${basePath}/manager` : `${basePath}/manager?weekOffset=${targetOffset}`;
  }

  function navigateToWeek(targetOffset: number) {
    if (targetOffset === activeWeekOffset || targetOffset < MIN_WEEK_OFFSET || targetOffset > MAX_WEEK_OFFSET) return;
    // Pure client-side date-range filter over the already-preloaded window -
    // no Server Action call, no `router.push`/`router.replace` (which would
    // re-run the whole Manager page and reset scroll).
    setActiveWeekOffset(targetOffset);
    window.history.replaceState(null, '', weekHref(targetOffset));
  }

  return (
    <section style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <strong style={{ fontSize: 16 }}>{t('shiftTable')}</strong>
          <DemoHelpButton content={HELP_MANAGER_SHIFT_TABLE} />
        </div>
        <PreviewScheduleCardActions
          periodStart={activePeriodStart}
          periodEnd={activePeriodEnd}
          requiredHeadcountByWeekday={requiredHeadcountByWeekday}
          shiftTypes={shiftTypes ?? []}
          hasUnpublishedChanges={weekAssignments.some((assignment) => !assignment.published)}
          onScheduleChanged={() => controller.refresh(activeWeekOffset, { force: true })}
        />
      </div>

      <p style={{ margin: '8px 0 4px', fontSize: 12.5, ...mutedText }}>
        {t('shiftTableHelp')}
      </p>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, margin: '12px 0' }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: demoColors.textPrimary, whiteSpace: 'nowrap' }}>
          {formatMonthDay(new Date(`${activePeriodStart}T00:00:00`))} 〜 {formatMonthDay(new Date(`${activePeriodEnd}T00:00:00`))}
        </span>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => navigateToWeek(activeWeekOffset - 1)} disabled={activeWeekOffset <= MIN_WEEK_OFFSET} style={activeWeekOffset <= MIN_WEEK_OFFSET ? buttonDisabled : buttonSecondary}>
            ← {t('prevWeek')}
          </button>
          <button
            type="button"
            onClick={() => navigateToWeek(0)}
            disabled={activeWeekOffset === 0}
            style={activeWeekOffset === 0 ? buttonDisabled : buttonSecondary}
            aria-disabled={activeWeekOffset === 0}
          >
            {t('today')}
          </button>
          <button type="button" onClick={() => navigateToWeek(activeWeekOffset + 1)} disabled={activeWeekOffset >= MAX_WEEK_OFFSET} style={activeWeekOffset >= MAX_WEEK_OFFSET ? buttonDisabled : buttonSecondary}>
            {t('nextWeek')} →
          </button>
        </div>
      </div>

      {staff === null ? (
        <p style={{ margin: '12px 0 0', ...mutedText }}>{t('staffListLoadError')}</p>
      ) : staff.length === 0 ? (
        <p style={{ margin: '12px 0 0', ...mutedText }}>{t('staffListEmpty')}</p>
      ) : (
        <div style={{ marginTop: 12, minHeight: 320 }}>
          <PreviewShiftGrid
            dates={dates}
            todayIso={todayIso}
            timeZone={timeZone}
            staff={staff}
            assignments={weekAssignments}
            shiftTypes={shiftTypes === null ? [] : shiftTypes}
            monthlySummaries={monthlySummaries}
            shortageDateSet={shortageDateSet}
            onAssignmentsChanged={(next) => {
              // A single-cell save/unassign is itself a newer snapshot than
              // anything already in flight for the currently displayed week -
              // invalidate that offset's in-flight fetch the same way a
              // newer `controller.refresh` call for that offset would.
              controller.invalidate(activeWeekOffset);
              setWindowAssignments((prev) => [
                ...prev.filter((a) => !dateSet.has(utcIsoToLocalDateTime(a.startsAt, timeZone).workDate)),
                ...next,
              ]);
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
