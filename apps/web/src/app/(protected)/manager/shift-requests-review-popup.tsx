'use client';

import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import type { WorkforceShiftRequest } from '@/lib/workforce/shift-requests';
import type { WorkforceStaffManageEntry } from '@/lib/workforce/employees';
import type { WorkforceShiftType } from '@/lib/workforce/shift-types';
import { shiftTypeDisplayLabel, shiftTypesForWeekLegend } from '@/lib/workforce/shift-types';
import { addIsoDays } from '@/lib/workforce/timezone';
import { getWeeksInMonth } from '@/lib/workforce/period';
import type { Lang } from '@/lib/demo/cafe/i18n';
import { HelpIconButton, Modal } from '@/components/shared/design-kit';
import { usePopupOpenTiming } from '@/lib/ui/popup-timing';
import { buttonPrimary, buttonSecondary, colors, minTouchTarget, mutedText, tableHeaderCell } from '@/lib/ui/theme';
import hoverStyles from '@/lib/ui/theme.module.css';
import { CUSTOM_CHIP_TONE, shiftChipColors, shiftChipStyle } from '../_ui/workforce-theme';

/** Same weekday-abbreviation convention as the Weekly Schedule grid's day header (`formatWeekday` in manager-dashboard-client.tsx) -- kept as a small local copy rather than a shared export, since it's a one-line pure function and the two grids are otherwise deliberately not coupled. */
function formatWeekday(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00.000Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
}
import {
  reminderMessageTemplate,
  shiftRequestsHeadingValue,
  shiftRequestsSummaryLabel,
  tManagerDashboard,
  weekRangeLabel,
} from './manager-dashboard-i18n';

/** Best-effort clipboard write for the reminder-stub popup -- silently a no-op if the Clipboard API is unavailable (older browser, non-HTTPS, or permission denied); the message stays visible in the read-only box either way, so nothing is lost, just not auto-copied. */
function copyReminderMessage(text: string) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).catch(() => {});
  }
}

export interface ShiftRequestsReviewPopupProps {
  open: boolean;
  onClose: () => void;
  requests: WorkforceShiftRequest[] | null;
  staff: WorkforceStaffManageEntry[];
  shiftTypes: WorkforceShiftType[] | null;
  activeShiftTypeIds: string[];
  monthPrefix: string;
  monthLabel: string;
  todayIso: string;
  lang: Lang;
}

const gridHeaderCellStyle: CSSProperties = {
  ...tableHeaderCell,
  textAlign: 'center',
  verticalAlign: 'middle',
  border: `1px solid ${colors.border}`,
  padding: '4px 6px',
  background: colors.surfaceElevated,
};

const gridCellStyle: CSSProperties = { border: `1px solid ${colors.border}`, padding: '3px' };

function cellButtonStyle(tone: { background: string; color: string } | null, clickable: boolean): CSSProperties {
  return {
    position: 'relative',
    width: '100%',
    height: minTouchTarget,
    padding: '6px 8px',
    borderRadius: 8,
    border: tone ? '1px solid transparent' : `1px dashed ${colors.border}`,
    background: tone ? tone.background : 'transparent',
    color: tone ? tone.color : colors.textMuted,
    fontSize: 12,
    fontWeight: 600,
    lineHeight: 1.2,
    cursor: clickable ? 'pointer' : 'default',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  };
}

/**
 * v2.1 Shift-requests review popup: a compact, month-scoped, week-paginated
 * view of submitted shift preferences (entry point: Settings > "Shift
 * requests"). UI ONLY -- "Approve"/"Remove approval" toggle a local
 * `approvedRequestIds` Set, never a `workforce.shift_requests.status` write,
 * and the reminder action is a copy-to-clipboard stub. Real persistence,
 * auto-distribute priority, and real reminder delivery are v2.2 scope (see
 * the plan file / project memory) -- deliberately deferred so this UI is not
 * built on top of architecture that doesn't exist yet.
 */
export function ShiftRequestsReviewPopup({
  open,
  onClose,
  requests,
  staff,
  shiftTypes,
  activeShiftTypeIds,
  monthPrefix,
  monthLabel,
  todayIso,
  lang,
}: ShiftRequestsReviewPopupProps) {
  const t = (key: Parameters<typeof tManagerDashboard>[1]) => tManagerDashboard(lang, key);
  usePopupOpenTiming(open, 'shift-requests-review');

  const [helpOpen, setHelpOpen] = useState(false);
  const [approvedRequestIds, setApprovedRequestIds] = useState<Set<string>>(new Set());
  const [approveTarget, setApproveTarget] = useState<{ staffId: string; date: string; request: WorkforceShiftRequest } | null>(null);
  const [approvedInfoTarget, setApprovedInfoTarget] = useState<{ staffId: string; date: string; request: WorkforceShiftRequest } | null>(null);
  const [reminderStaffId, setReminderStaffId] = useState<string | null>(null);
  const [reminderCopied, setReminderCopied] = useState(false);

  const weeks = useMemo(() => getWeeksInMonth(monthPrefix), [monthPrefix]);
  const todayWeekIndex = useMemo(() => {
    const index = weeks.findIndex((w) => todayIso >= w.weekStart && todayIso <= w.weekEnd);
    return index >= 0 ? index : 0;
  }, [weeks, todayIso]);
  const [weekIndex, setWeekIndex] = useState(todayWeekIndex);
  const clampedWeekIndex = Math.min(weekIndex, weeks.length - 1);
  const activeWeek = weeks[clampedWeekIndex];
  const weekDates = useMemo(
    () => (activeWeek ? Array.from({ length: 7 }, (_, i) => addIsoDays(activeWeek.weekStart, i)) : []),
    [activeWeek],
  );

  const activeStaff = useMemo(
    () => [...staff].filter((s) => s.isActive).sort((a, b) => a.name.localeCompare(b.name)),
    [staff],
  );

  const requestsThisMonth = useMemo(
    () => (requests ?? []).filter((r) => r.workDate.startsWith(monthPrefix)),
    [requests, monthPrefix],
  );
  const requestsByEmployeeAndDate = useMemo(() => {
    const map = new Map<string, WorkforceShiftRequest>();
    for (const r of requestsThisMonth) map.set(`${r.employeeId}:${r.workDate}`, r);
    return map;
  }, [requestsThisMonth]);
  const submittedEmployeeIds = useMemo(
    () => new Set(requestsThisMonth.map((r) => r.employeeId)),
    [requestsThisMonth],
  );
  const submittedCount = activeStaff.filter((s) => submittedEmployeeIds.has(s.staffId)).length;
  const totalCount = activeStaff.length;
  const missingCount = totalCount - submittedCount;

  const shiftTypeById = useMemo(() => new Map((shiftTypes ?? []).map((st) => [st.shiftTypeId, st])), [shiftTypes]);
  const weekLegendTypes = useMemo(
    () =>
      shiftTypesForWeekLegend(
        (shiftTypes ?? []).filter((st) => st.isActive),
        weekDates.flatMap((date) =>
          activeStaff
            .map((s) => requestsByEmployeeAndDate.get(`${s.staffId}:${date}`))
            .filter((r): r is WorkforceShiftRequest => Boolean(r) && !r!.isUnavailable && r!.shiftTypeId !== null),
        ),
        shiftTypeById,
      ),
    [shiftTypes, weekDates, activeStaff, requestsByEmployeeAndDate, shiftTypeById],
  );
  const weekHasCustom = useMemo(
    () =>
      weekDates.some((date) =>
        activeStaff.some((s) => {
          const r = requestsByEmployeeAndDate.get(`${s.staffId}:${date}`);
          return r && !r.isUnavailable && r.shiftTypeId === null;
        }),
      ),
    [weekDates, activeStaff, requestsByEmployeeAndDate],
  );

  function renderCell(staffId: string, date: string) {
    const request = requestsByEmployeeAndDate.get(`${staffId}:${date}`);
    if (!request) return <span aria-hidden="true" style={{ ...mutedText, fontSize: 13 }}>+</span>;
    if (request.isUnavailable) return <span aria-hidden="true" style={{ ...mutedText, fontSize: 13 }}>—</span>;

    const shiftType = request.shiftTypeId ? shiftTypeById.get(request.shiftTypeId) : undefined;
    const label = shiftType ? shiftTypeDisplayLabel(shiftType) : t('shiftTypeCustom');
    const tone = request.shiftTypeId ? shiftChipColors(request.shiftTypeId, activeShiftTypeIds) : CUSTOM_CHIP_TONE;
    const isApproved = approvedRequestIds.has(request.requestId);

    return (
      <button
        type="button"
        className={hoverStyles.scheduleCellButton}
        style={cellButtonStyle(tone, true)}
        title={label}
        onClick={() =>
          isApproved
            ? setApprovedInfoTarget({ staffId, date, request })
            : setApproveTarget({ staffId, date, request })
        }
      >
        {isApproved ? `✓ ${label}` : label}
      </button>
    );
  }

  const reminderStaffName = reminderStaffId ? staff.find((s) => s.staffId === reminderStaffId)?.name ?? '' : '';
  const reminderText = reminderStaffId ? reminderMessageTemplate[lang](reminderStaffName, monthLabel) : '';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={shiftRequestsHeadingValue[lang](monthLabel)}
      titleAdornment={<HelpIconButton ariaLabel={t('shiftRequestsPopupHelpAriaLabel')} onClick={() => setHelpOpen(true)} />}
      width="min(900px, 96vw)"
      closeLabel={t('cancel')}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 12 }}>
        <button
          type="button"
          className={clampedWeekIndex === 0 ? undefined : hoverStyles.buttonSecondary}
          style={{ ...buttonSecondary, minWidth: 36, padding: '6px 10px', ...(clampedWeekIndex === 0 ? { opacity: 0.4, cursor: 'default' } : {}) }}
          disabled={clampedWeekIndex === 0}
          aria-label={t('prevWeek')}
          title={t('prevWeek')}
          onClick={() => setWeekIndex((i) => Math.max(0, i - 1))}
        >
          &lsaquo;
        </button>
        <span style={{ fontSize: 13, fontWeight: 600 }}>
          {activeWeek ? weekRangeLabel[lang](activeWeek.weekStart, activeWeek.weekEnd) : ''}
        </span>
        <button
          type="button"
          className={clampedWeekIndex >= weeks.length - 1 ? undefined : hoverStyles.buttonSecondary}
          style={{ ...buttonSecondary, minWidth: 36, padding: '6px 10px', ...(clampedWeekIndex >= weeks.length - 1 ? { opacity: 0.4, cursor: 'default' } : {}) }}
          disabled={clampedWeekIndex >= weeks.length - 1}
          aria-label={t('nextWeek')}
          title={t('nextWeek')}
          onClick={() => setWeekIndex((i) => Math.min(weeks.length - 1, i + 1))}
        >
          &rsaquo;
        </button>
      </div>

      {activeStaff.length === 0 ? (
        <p style={{ margin: 0, ...mutedText }}>{t('submittedPreferencesEmpty')}</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: '3px 3px', fontSize: 12.5 }}>
            <colgroup>
              <col style={{ width: '20%' }} />
              {weekDates.map((date) => (
                <col key={date} style={{ width: `${80 / 7}%` }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th style={gridHeaderCellStyle}>{t('colStaff')}</th>
                {weekDates.map((date) => (
                  <th key={date} style={{ ...gridHeaderCellStyle, ...(date === todayIso ? { background: colors.accentMuted } : {}) }}>
                    {formatWeekday(date)}
                    <br />
                    {date.slice(8)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activeStaff.map((s) => {
                const submitted = submittedEmployeeIds.has(s.staffId);
                return (
                  <tr key={s.staffId}>
                    <td style={gridCellStyle}>
                      {submitted ? (
                        <span
                          style={{
                            width: '100%',
                            minHeight: minTouchTarget,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            textAlign: 'center',
                            padding: '6px 4px',
                            fontWeight: 600,
                            color: colors.textPrimary,
                            fontSize: 12.5,
                            boxSizing: 'border-box',
                          }}
                        >
                          {s.name}
                        </span>
                      ) : (
                        <button
                          type="button"
                          className={hoverStyles.staffNameCell}
                          style={{ width: '100%', minHeight: minTouchTarget, border: 0, background: 'none', cursor: 'pointer', padding: '6px 4px', font: 'inherit', fontWeight: 600, color: colors.dangerText, fontSize: 12.5, borderRadius: 6, boxSizing: 'border-box' }}
                          title={s.name}
                          onClick={() => setReminderStaffId(s.staffId)}
                        >
                          {s.name}
                        </button>
                      )}
                    </td>
                    {weekDates.map((date) => (
                      <td key={date} style={gridCellStyle}>
                        {renderCell(s.staffId, date)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {weekLegendTypes.length > 0 || weekHasCustom ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
          {weekLegendTypes.map((st) => (
            <span key={st.shiftTypeId} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={shiftChipStyle(shiftChipColors(st.shiftTypeId, activeShiftTypeIds))}>{shiftTypeDisplayLabel(st)}</span>
              <span style={{ ...mutedText, fontSize: 12 }}>{st.startsAtLocal}-{st.endsAtLocal}</span>
            </span>
          ))}
          {weekHasCustom ? <span style={shiftChipStyle(CUSTOM_CHIP_TONE)}>{t('shiftTypeCustom')}</span> : null}
        </div>
      ) : null}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
        <span style={{ fontSize: 13, ...mutedText }}>{shiftRequestsSummaryLabel[lang](submittedCount, totalCount, missingCount)}</span>
      </div>

      <Modal open={helpOpen} onClose={() => setHelpOpen(false)} title={t('shiftRequestsPopupHelpTitle')} closeLabel={t('cancel')} width="min(480px, 94vw)">
        <div style={{ whiteSpace: 'pre-line' }}>{t('shiftRequestsPopupHelpBody')}</div>
      </Modal>

      <Modal
        open={approveTarget !== null}
        onClose={() => setApproveTarget(null)}
        title={t('approvePreferenceTitle')}
        closeLabel={t('cancel')}
        width="min(420px, 94vw)"
      >
        {approveTarget ? (
          <div>
            <p style={{ margin: 0, fontWeight: 600 }}>{staff.find((s) => s.staffId === approveTarget.staffId)?.name ?? ''}</p>
            <p style={{ margin: '4px 0 0', ...mutedText }}>{approveTarget.date}</p>
            <p style={{ margin: '12px 0 0', whiteSpace: 'pre-line', fontSize: 13, ...mutedText }}>{t('priorityExplainerBody')}</p>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button
                type="button"
                className={hoverStyles.buttonPrimary}
                style={buttonPrimary}
                onClick={() => {
                  setApprovedRequestIds((current) => new Set(current).add(approveTarget.request.requestId));
                  setApproveTarget(null);
                }}
              >
                {t('approve')}
              </button>
              <button type="button" className={hoverStyles.buttonSecondary} style={buttonSecondary} onClick={() => setApproveTarget(null)}>
                {t('cancel')}
              </button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={approvedInfoTarget !== null}
        onClose={() => setApprovedInfoTarget(null)}
        title={t('approvedPreferenceTitle')}
        closeLabel={t('cancel')}
        width="min(420px, 94vw)"
      >
        {approvedInfoTarget ? (
          <div>
            <p style={{ margin: 0 }}>{t('approvedPreferenceBody')}</p>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button
                type="button"
                className={hoverStyles.buttonSecondary}
                style={buttonSecondary}
                onClick={() => {
                  setApprovedRequestIds((current) => {
                    const next = new Set(current);
                    next.delete(approvedInfoTarget.request.requestId);
                    return next;
                  });
                  setApprovedInfoTarget(null);
                }}
              >
                {t('removeApprovalButton')}
              </button>
              <button type="button" className={hoverStyles.buttonSecondary} style={buttonSecondary} onClick={() => setApprovedInfoTarget(null)}>
                {t('close')}
              </button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={reminderStaffId !== null}
        onClose={() => {
          setReminderStaffId(null);
          setReminderCopied(false);
        }}
        title={t('sendReminderTitle')}
        closeLabel={t('cancel')}
        width="min(420px, 94vw)"
      >
        <p style={{ margin: 0, fontSize: 13, ...mutedText }}>{t('sendReminderBody')}</p>
        <p style={{ margin: '10px 0 0', padding: '10px 12px', borderRadius: 8, border: `1px solid ${colors.border}`, background: colors.surfaceElevated, fontSize: 13, whiteSpace: 'pre-line' }}>
          {reminderText}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
          <button
            type="button"
            className={hoverStyles.buttonPrimary}
            style={buttonPrimary}
            onClick={() => {
              copyReminderMessage(reminderText);
              setReminderCopied(true);
            }}
          >
            {t('copyReminderButton')}
          </button>
          <button
            type="button"
            className={hoverStyles.buttonSecondary}
            style={buttonSecondary}
            onClick={() => {
              setReminderStaffId(null);
              setReminderCopied(false);
            }}
          >
            {t('cancel')}
          </button>
          {reminderCopied ? <span style={{ fontSize: 12, color: colors.success }}>{t('reminderCopiedNotice')}</span> : null}
        </div>
      </Modal>
    </Modal>
  );
}
