'use client';

import { useEffect, useState } from 'react';
import type { WorkforceStaffManageEntry } from '@/lib/workforce/employees';
import type { WorkforceAttendance } from '@/lib/workforce/attendance';
import { estimatedEarningsSummary } from '@/lib/workforce/estimated-earnings';
import {
  formatMonthLabel,
  isMonthCoveredByLoadRange,
  isSelectableReportMonth,
  shiftMonthPrefix,
} from '@/lib/workforce/attendance-month';
import { loadStaffMonthAttendance } from '@/lib/workforce/attendance-month-actions';
import { Modal } from '@/components/shared/design-kit';
import { alertDanger, badgeStyle, buttonDisabled, buttonPrimary, buttonSecondary, mutedText } from '@/lib/ui/theme';
import hoverStyles from '@/lib/ui/theme.module.css';
import type { Lang } from '@/lib/demo/cafe/i18n';
import { tManagerDashboard } from './manager-dashboard-i18n';

export interface StaffNameDetailPopupProps {
  open: boolean;
  onClose: () => void;
  staffEntry: WorkforceStaffManageEntry | null;
  /** Page-loaded tenant attendance (`attendanceRange` window) -- this component filters to `staffEntry`'s own rows. */
  attendance: WorkforceAttendance[];
  /** The window `attendance` covers; a month outside it is fetched on demand for this one staff member. */
  attendanceRange: { fromDate: string; toDate: string };
  /** Current local month, `YYYY-MM` -- the default selection and the latest selectable month (QA4 F2: up to 12 months back). */
  currentMonthPrefix: string;
  lang: Lang;
}

type MonthLoad = { status: 'loading' } | { status: 'error' } | { status: 'loaded'; rows: WorkforceAttendance[] };

/**
 * Read-only staff detail popup opened from the Shift-schedule grid's staff
 * name (A6). Numbers come from `estimated-earnings.ts` (the same
 * attendance-based calculation already used elsewhere in this app), not any
 * schedule-based estimate -- deliberately correct per the mission's
 * "estimated labour cost = hours already worked, not the full theoretical
 * week" decision. "Copy monthly report" builds a plain-text summary for
 * pasting elsewhere (chat, spreadsheet); there is no clipboard-formatting
 * logic anywhere else in this codebase to reuse (checked), so this is a new,
 * minimal implementation, not a port.
 */
export function StaffNameDetailPopup({
  open,
  onClose,
  staffEntry,
  attendance,
  attendanceRange,
  currentMonthPrefix,
  lang,
}: StaffNameDetailPopupProps) {
  const t = (key: Parameters<typeof tManagerDashboard>[1]) => tManagerDashboard(lang, key);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  // QA4 F2: selected report month. The parent remounts this component per
  // staff member (`key`), so the selection and the on-demand cache below
  // reset to the current month every time the popup is opened.
  const [monthPrefix, setMonthPrefix] = useState(currentMonthPrefix);
  const [monthLoads, setMonthLoads] = useState<Record<string, MonthLoad>>({});
  const [retryToken, setRetryToken] = useState(0);

  const staffId = staffEntry?.staffId ?? null;
  const monthIsPreloaded = isMonthCoveredByLoadRange(monthPrefix, attendanceRange);
  const monthLoad: MonthLoad | undefined = monthIsPreloaded ? undefined : monthLoads[monthPrefix];

  // Months outside the page-load window: one Server Action call per
  // (staff member, month), only when the Manager actually selects that
  // month; cached for as long as the popup stays open.
  // Results are keyed by month, so a response that lands after the Manager
  // already paged on is simply cached (no cancellation needed). `monthLoads`
  // is read but deliberately not a dependency (this effect writes it);
  // `retryToken` re-runs the effect after an error.
  useEffect(() => {
    if (!open || !staffId || monthIsPreloaded) return;
    const existing = monthLoads[monthPrefix];
    if (existing && existing.status !== 'error') return;
    const month = monthPrefix;
    setMonthLoads((prev) => ({ ...prev, [month]: { status: 'loading' } }));
    loadStaffMonthAttendance(staffId, month)
      .then((result) => {
        setMonthLoads((prev) => ({
          ...prev,
          [month]: result.status === 'success' ? { status: 'loaded', rows: result.data } : { status: 'error' },
        }));
      })
      .catch(() => setMonthLoads((prev) => ({ ...prev, [month]: { status: 'error' } })));
  }, [open, staffId, monthPrefix, monthIsPreloaded, retryToken]);

  const monthRows: WorkforceAttendance[] | null = monthIsPreloaded
    ? attendance
    : monthLoad?.status === 'loaded'
      ? monthLoad.rows
      : null;
  const ownAttendance = staffEntry && monthRows ? monthRows.filter((a) => a.employeeId === staffEntry.staffId) : [];
  const summary = estimatedEarningsSummary(ownAttendance, monthPrefix, staffEntry?.hourlyWageYen ?? null);
  // Units on every value (2026-10-07 full QA: the card showed bare "4.8 / 1200 / 5760").
  const yen = (value: number | null) => (value === null ? '—' : `¥${value.toLocaleString('ja-JP')}`);
  // Copy Audit A-05: the copied report showed the raw YYYY-MM month key.
  const monthText = formatMonthLabel(monthPrefix, lang);
  const hoursText = `${summary.workedHours}h`;
  const wageText = yen(summary.hourlyWageYen);
  const earnedText = yen(summary.estimatedEarningsYen);
  const isCurrentMonth = monthPrefix === currentMonthPrefix;
  const workedHoursLabel = isCurrentMonth ? t('staffNamePopupWorkedHours') : t('staffNamePopupWorkedHoursMonth');
  const earnedLabel = isCurrentMonth ? t('staffNamePopupEarnedSoFar') : t('staffNamePopupEarnedMonth');
  const dataReady = monthRows !== null;
  const prevMonth = shiftMonthPrefix(monthPrefix, -1);
  const nextMonth = shiftMonthPrefix(monthPrefix, 1);
  const canGoPrev = isSelectableReportMonth(prevMonth, currentMonthPrefix);
  const canGoNext = isSelectableReportMonth(nextMonth, currentMonthPrefix);

  function selectMonth(next: string) {
    setCopyState('idle');
    setMonthPrefix(next);
  }

  function handleCopy() {
    if (!staffEntry || !dataReady) return;
    const lines = [
      `${t('staffNamePopupTitlePrefix')}: ${staffEntry.name}`,
      `${t('staffNamePopupMonth')}: ${monthText}`,
      `${workedHoursLabel}: ${hoursText}`,
      `${t('staffNamePopupHourlyWage')}: ${wageText}`,
      `${earnedLabel}: ${earnedText}`,
    ];
    const text = lines.join('\n');

    if (!navigator.clipboard?.writeText) {
      setCopyState('failed');
      return;
    }
    navigator.clipboard
      .writeText(text)
      .then(() => setCopyState('copied'))
      .catch(() => setCopyState('failed'));
  }

  return (
    <Modal
      open={open && staffEntry !== null}
      onClose={() => {
        setCopyState('idle');
        onClose();
      }}
      title={staffEntry?.name ?? ''}
      closeLabel={t('close')}
      width="min(480px, 94vw)"
    >
      {staffEntry ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={badgeStyle(staffEntry.isActive ? 'active' : 'neutral')}>
              {staffEntry.isActive ? t('statusActive') : t('statusInactive')}
            </span>
            {staffEntry.positionLabel ? <span style={mutedText}>{staffEntry.positionLabel}</span> : null}
          </div>

          {/* QA4 F2: month selector -- current month back to 12 months ago. */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <button
              type="button"
              className={canGoPrev ? hoverStyles.buttonSecondary : undefined}
              style={{ ...(canGoPrev ? buttonSecondary : buttonDisabled), padding: '6px 12px' }}
              disabled={!canGoPrev}
              aria-label={t('staffNamePopupPrevMonth')}
              title={t('staffNamePopupPrevMonth')}
              onClick={() => selectMonth(prevMonth)}
            >
              <span aria-hidden="true">‹</span>
            </button>
            <strong aria-live="polite" style={{ fontSize: 15 }}>
              {monthText}
            </strong>
            <button
              type="button"
              className={canGoNext ? hoverStyles.buttonSecondary : undefined}
              style={{ ...(canGoNext ? buttonSecondary : buttonDisabled), padding: '6px 12px' }}
              disabled={!canGoNext}
              aria-label={t('staffNamePopupNextMonth')}
              title={t('staffNamePopupNextMonth')}
              onClick={() => selectMonth(nextMonth)}
            >
              <span aria-hidden="true">›</span>
            </button>
          </div>

          {monthLoad?.status === 'error' ? (
            <div role="alert" style={{ ...alertDanger, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span>{t('staffNamePopupLoadFailed')}</span>
              <button
                type="button"
                className={hoverStyles.buttonSecondary}
                style={{ ...buttonSecondary, padding: '4px 12px' }}
                onClick={() => setRetryToken((n) => n + 1)}
              >
                {t('staffNamePopupRetry')}
              </button>
            </div>
          ) : !dataReady ? (
            <p role="status" style={{ margin: 0, ...mutedText, fontSize: 14 }}>
              {t('staffNamePopupLoading')}
            </p>
          ) : (
            <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', rowGap: 8, columnGap: 12, fontSize: 14 }}>
              <dt style={mutedText}>{workedHoursLabel}</dt>
              <dd style={{ margin: 0 }}>{hoursText}</dd>
              <dt style={mutedText}>{t('staffNamePopupHourlyWage')}</dt>
              <dd style={{ margin: 0 }}>{wageText}</dd>
              <dt style={mutedText}>{earnedLabel}</dt>
              <dd style={{ margin: 0 }}>{earnedText}</dd>
            </dl>
          )}

          <div>
            <button
              type="button"
              className={dataReady ? hoverStyles.buttonPrimary : undefined}
              style={dataReady ? buttonPrimary : buttonDisabled}
              disabled={!dataReady}
              onClick={handleCopy}
            >
              {t('staffNamePopupCopyReport')}
            </button>
            {copyState === 'copied' ? (
              <span role="status" style={{ ...mutedText, marginLeft: 10, fontSize: 13 }}>
                {t('staffNamePopupCopied')}
              </span>
            ) : null}
            {copyState === 'failed' ? (
              <span role="alert" style={{ marginLeft: 10, fontSize: 13, color: 'crimson' }}>
                {t('staffNamePopupCopyFailed')}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
