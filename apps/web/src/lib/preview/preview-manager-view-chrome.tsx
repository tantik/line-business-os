'use client';

import { useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { WorkforceStaffManageEntry } from '@/lib/workforce/employees';
import type { WorkforceShiftType } from '@/lib/workforce/shift-types';
import type { WorkforceShiftAssignment } from '@/lib/workforce/shift-assignments';
import type { WorkforceAttendance } from '@/lib/workforce/attendance';
import { estimatedEarningsSummary } from '@/lib/workforce/estimated-earnings';
import { addIsoDays } from '@/lib/workforce/timezone';
import { todayIsoInTimeZone } from '@/app/(protected)/dashboard/workforce/_ui/workforce-theme';
import { PreviewShiftGrid } from './preview-shift-grid';
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
  actionsSlot?: ReactNode;
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
  actionsSlot,
}: PreviewManagerViewChromeProps) {
  const dates = weekDates(periodStart);
  const todayIso = todayIsoInTimeZone(timeZone);
  const { lang } = useLang();
  const t = (key: Parameters<typeof tManager>[1]) => tManager(lang, key);
  const router = useRouter();
  const [isNavigating, startNavigation] = useTransition();
  const monthPrefix = todayIso.slice(0, 7);
  const monthlySummaries = Object.fromEntries((staff ?? []).map((entry) => [
    entry.staffId,
    estimatedEarningsSummary((attendance ?? []).filter((row) => row.employeeId === entry.staffId), monthPrefix, entry.hourlyWageYen),
  ]));
  const estimatedLabourCost = Object.values(monthlySummaries).reduce((sum, item) => sum + (item.estimatedEarningsYen ?? 0), 0);
  const managerLegendShiftTypes = (shiftTypes ?? []).filter(
    (shiftType) =>
      shiftType.isActive ||
      (assignments ?? []).some(
        (assignment) => assignment.employeeId && assignment.shiftTypeId === shiftType.shiftTypeId,
      ),
  );

  function navigateToWeek(targetOffset: number) {
    if (targetOffset === weekOffset || targetOffset < MIN_WEEK_OFFSET || targetOffset > MAX_WEEK_OFFSET) return;
    const href = weekHref(targetOffset);
    startNavigation(() => router.push(href));
  }

  function weekHref(targetOffset: number) {
    return targetOffset === 0 ? `${basePath}/manager` : `${basePath}/manager?weekOffset=${targetOffset}`;
  }

  function prefetchWeek(targetOffset: number) {
    if (targetOffset < MIN_WEEK_OFFSET || targetOffset > MAX_WEEK_OFFSET) return;
    router.prefetch(weekHref(targetOffset));
  }

  return (
    <section style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <strong style={{ fontSize: 16 }}>{t('shiftTable')}</strong>
          <DemoHelpButton content={HELP_MANAGER_SHIFT_TABLE} />
        </div>
        {actionsSlot}
      </div>

      <p style={{ margin: '8px 0 4px', fontSize: 12.5, ...mutedText }}>
        {t('shiftTableHelp')}
      </p>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, margin: '12px 0' }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: demoColors.textPrimary }}>
          {formatMonthDay(new Date(`${periodStart}T00:00:00`))} 〜 {formatMonthDay(new Date(`${periodEnd}T00:00:00`))}
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => navigateToWeek(weekOffset - 1)} onPointerEnter={() => prefetchWeek(weekOffset - 1)} onFocus={() => prefetchWeek(weekOffset - 1)} disabled={isNavigating || weekOffset <= MIN_WEEK_OFFSET} style={isNavigating || weekOffset <= MIN_WEEK_OFFSET ? buttonDisabled : buttonSecondary}>
            ← {t('prevWeek')}
          </button>
          <button
            type="button"
            onClick={() => navigateToWeek(0)}
            disabled={weekOffset === 0 || isNavigating}
            style={weekOffset === 0 ? buttonDisabled : buttonSecondary}
            aria-disabled={weekOffset === 0}
          >
            {t('today')}
          </button>
          <button type="button" onClick={() => navigateToWeek(weekOffset + 1)} onPointerEnter={() => prefetchWeek(weekOffset + 1)} onFocus={() => prefetchWeek(weekOffset + 1)} disabled={isNavigating || weekOffset >= MAX_WEEK_OFFSET} style={isNavigating || weekOffset >= MAX_WEEK_OFFSET ? buttonDisabled : buttonSecondary}>
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
            assignments={assignments === null ? [] : assignments}
            shiftTypes={shiftTypes === null ? [] : shiftTypes}
            monthlySummaries={monthlySummaries}
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
