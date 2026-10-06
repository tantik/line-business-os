'use client';

import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import type { WorkforceShiftRequest } from '@/lib/workforce/shift-requests';
import type { WorkforceStaffManageEntry } from '@/lib/workforce/employees';
import type { WorkforceShiftType } from '@/lib/workforce/shift-types';
import { shiftTypeDisplayLabel, shiftTypesForWeekLegend } from '@/lib/workforce/shift-types';
import { addIsoDays } from '@/lib/workforce/timezone';
import { getWeeksInMonth } from '@/lib/workforce/period';
import type { Lang } from '@/lib/demo/cafe/i18n';
import { weekdayLabel } from '@/lib/demo/cafe/format';
import { HelpIconButton, Modal } from '@/components/shared/design-kit';
import { usePopupOpenTiming } from '@/lib/ui/popup-timing';
import { alertDanger, buttonDisabled, buttonPrimary, buttonSecondary, colors, minTouchTarget, mutedText, tableHeaderCell } from '@/lib/ui/theme';
import hoverStyles from '@/lib/ui/theme.module.css';
import { markShiftPreferenceReviewed, sendShiftPreferenceReminderEmail } from '@/lib/workforce/shift-preference-actions';
import { buildShiftPreferenceReminderEmail, nextMonthPrefix } from '@/lib/workforce/shift-preference-reminder-email';
import type { ReminderDelivery } from '@/lib/workforce/shift-preference-reminder';
import { CUSTOM_CHIP_TONE, shiftChipColors, shiftChipStyle, UNAVAILABLE_CHIP_TONE } from '../_ui/workforce-theme';

/**
 * Mission 8 Quality Sweep fix (F11): this popup's grid header previously
 * hardcoded the English `Mon/Tue/Wed...` abbreviation regardless of `lang`
 * (same bug as the Weekly Schedule grid's own `formatWeekday`,
 * `manager-dashboard-client.tsx`) -- now routes through the shared
 * `weekdayLabel` helper instead of a local English-only copy.
 */
function formatWeekday(isoDate: string, lang: Lang): string {
  // See the identical comment on `manager-dashboard-client.tsx`'s own
  // `formatWeekday`: `weekdayLabel` resolves via LOCAL `.getDay()`, so this
  // must construct a local-midnight Date (no `Z`), matching `ShiftTable`'s
  // existing convention -- a UTC-anchored Date here would silently mislabel
  // the weekday for any browser session west of UTC.
  return weekdayLabel(new Date(`${isoDate}T00:00:00`), lang);
}
import {
  shiftRequestsHeadingValue,
  shiftRequestsSummaryLabel,
  tManagerDashboard,
  weekRangeLabel,
} from './manager-dashboard-i18n';

export interface ShiftRequestsReviewPopupProps {
  open: boolean;
  onClose: () => void;
  requests: WorkforceShiftRequest[] | null;
  staff: WorkforceStaffManageEntry[];
  shiftTypes: WorkforceShiftType[] | null;
  activeShiftTypeIds: string[];
  todayIso: string;
  lang: Lang;
}

type MonthChoice = 'next' | 'current';
type ReminderState = 'idle' | 'sending' | ReminderDelivery | 'error';

function monthLabelFor(monthPrefix: string, lang: Lang): string {
  return new Intl.DateTimeFormat(lang === 'ja' ? 'ja-JP' : 'en-US', { year: 'numeric', month: 'long', timeZone: 'UTC' }).format(
    new Date(`${monthPrefix}-01T00:00:00Z`),
  );
}

/** Fresh per-dialog idempotency nonce for the reminder send (Resend `Idempotency-Key`): a double click or retry inside one open dialog never sends twice. */
function newReminderNonce(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : '00000000-0000-4000-8000-000000000000'.replace(/0/g, () => Math.floor(Math.random() * 16).toString(16));
}

const gridHeaderCellStyle: CSSProperties = {
  ...tableHeaderCell,
  textAlign: 'center',
  verticalAlign: 'middle',
  border: `1px solid ${colors.border}`,
  padding: '4px 6px',
  background: colors.surfaceElevated,
};

const gridCellStyle: CSSProperties = { border: `1px solid ${colors.border}`, padding: '3px', textAlign: 'center' };

/** Small corner badge marking a staff row that hasn't submitted preferences yet -- same absolute-corner-circle shape as the Weekly Schedule grid's own alert marker, kept local here rather than importing that file's private constant. */
const missingCornerStyle: CSSProperties = {
  position: 'absolute',
  top: 2,
  right: 2,
  width: 13,
  height: 13,
  borderRadius: '50%',
  background: colors.danger,
  color: '#fff',
  fontSize: 9.5,
  fontWeight: 700,
  lineHeight: '13px',
  textAlign: 'center',
};

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
 * Shift preferences review popup: a compact, month-scoped, week-paginated
 * view of submitted shift preferences (entry point: Settings > "Shift
 * requests"). Opens on NEXT month -- the month the Staff monthly modal
 * submits for -- with a toggle back to the current month.
 *
 * 2026-10-06 recovery (was UI-only in v2.1):
 *   - "Reviewed" is persisted (`markShiftPreferenceReviewed` ->
 *     `status = 'approved'` on the preference row). `statusOverrides` only
 *     mirrors a server-confirmed write until the page's own data reloads; it
 *     is never set optimistically. Reviewed never changes auto-schedule
 *     priority (nothing in scheduling reads `status` on a preference row).
 *   - The reminder really emails the employee (`sendShiftPreferenceReminderEmail`,
 *     Resend); the address is resolved and decrypted server-side only.
 *   - Cells show three distinct states: a shift chip, a 休み/Off chip
 *     (`is_unavailable`), or "–" (no row = no preference).
 */
export function ShiftRequestsReviewPopup({
  open,
  onClose,
  requests,
  staff,
  shiftTypes,
  activeShiftTypeIds,
  todayIso,
  lang,
}: ShiftRequestsReviewPopupProps) {
  const t = (key: Parameters<typeof tManagerDashboard>[1]) => tManagerDashboard(lang, key);
  usePopupOpenTiming(open, 'shift-requests-review');

  const [helpOpen, setHelpOpen] = useState(false);
  const [statusOverrides, setStatusOverrides] = useState<Map<string, string>>(new Map());
  const [reviewTarget, setReviewTarget] = useState<{ staffId: string; date: string; request: WorkforceShiftRequest } | null>(null);
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewError, setReviewError] = useState(false);
  const [reminderStaffId, setReminderStaffId] = useState<string | null>(null);
  const [reminderNonce, setReminderNonce] = useState('');
  const [reminderState, setReminderState] = useState<ReminderState>('idle');

  // Once the page's own data reloads, the server rows are authoritative again
  // (e.g. another Manager un-marked a row meanwhile).
  useEffect(() => {
    setStatusOverrides(new Map());
  }, [requests]);

  const [monthChoice, setMonthChoice] = useState<MonthChoice>('next');
  const monthPrefix = monthChoice === 'next' ? nextMonthPrefix(todayIso) : todayIso.slice(0, 7);
  const monthLabel = monthLabelFor(monthPrefix, lang);

  const weeks = useMemo(() => getWeeksInMonth(monthPrefix), [monthPrefix]);
  const [weekIndex, setWeekIndex] = useState(0);

  function selectMonth(choice: MonthChoice) {
    if (choice === monthChoice) return;
    setMonthChoice(choice);
    // Next month has no "today" in it, so it starts on its first week; the
    // current month starts on today's week, as before.
    const todayWeek = getWeeksInMonth(todayIso.slice(0, 7)).findIndex((w) => todayIso >= w.weekStart && todayIso <= w.weekEnd);
    setWeekIndex(choice === 'current' ? Math.max(0, todayWeek) : 0);
  }
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
  // Keyed over ALL loaded preferences, not just this month's: a week row
  // spans a month boundary, and an adjacent-month day must show its real
  // state, not "–" (which means "no preference"). Counts below stay
  // month-scoped via `requestsThisMonth`.
  const requestsByEmployeeAndDate = useMemo(() => {
    const map = new Map<string, WorkforceShiftRequest>();
    for (const r of requests ?? []) map.set(`${r.employeeId}:${r.workDate}`, r);
    return map;
  }, [requests]);
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
  const weekHasUnavailable = useMemo(
    () => weekDates.some((date) => activeStaff.some((s) => requestsByEmployeeAndDate.get(`${s.staffId}:${date}`)?.isUnavailable === true)),
    [weekDates, activeStaff, requestsByEmployeeAndDate],
  );

  function isReviewed(request: WorkforceShiftRequest): boolean {
    return (statusOverrides.get(request.requestId) ?? request.status) === 'approved';
  }

  function renderCell(staffId: string, date: string) {
    const request = requestsByEmployeeAndDate.get(`${staffId}:${date}`);
    if (!request) {
      return (
        <span title={t('noPreferenceSubmittedHint')} aria-label={t('noPreferenceSubmittedHint')} style={{ ...mutedText, fontSize: 13 }}>
          —
        </span>
      );
    }

    const shiftType = request.shiftTypeId ? shiftTypeById.get(request.shiftTypeId) : undefined;
    const label = request.isUnavailable ? t('preferenceUnavailableChip') : shiftType ? shiftTypeDisplayLabel(shiftType) : t('shiftTypeCustom');
    const tone = request.isUnavailable
      ? UNAVAILABLE_CHIP_TONE
      : request.shiftTypeId
        ? shiftChipColors(request.shiftTypeId, activeShiftTypeIds)
        : CUSTOM_CHIP_TONE;
    const reviewed = isReviewed(request);
    const title = request.isUnavailable ? t('markedUnavailableHint') : label;

    return (
      <button
        type="button"
        className={hoverStyles.scheduleCellButton}
        style={cellButtonStyle(tone, true)}
        title={title}
        aria-label={`${title}${reviewed ? ` (${t('reviewedPreferenceTitle')})` : ''}`}
        onClick={() => {
          setReviewError(false);
          setReviewTarget({ staffId, date, request });
        }}
      >
        {reviewed ? `✓ ${label}` : label}
      </button>
    );
  }

  async function saveReview(request: WorkforceShiftRequest, reviewed: boolean) {
    setReviewSaving(true);
    setReviewError(false);
    try {
      const result = await markShiftPreferenceReviewed({ requestId: request.requestId, reviewed });
      if (result.status === 'success') {
        setStatusOverrides((current) => new Map(current).set(request.requestId, result.data.status));
        setReviewTarget(null);
      } else {
        setReviewError(true);
      }
    } catch {
      setReviewError(true);
    } finally {
      setReviewSaving(false);
    }
  }

  /**
   * The legacy design-kit Modal closes on a window-level Escape, so Escape
   * inside a nested dialog also reaches this outer popup. Refuse to close
   * while a write is in flight, and reset the nested dialogs on close so a
   * reopen never shows a stale "sent" reminder or review dialog.
   */
  function handleClose() {
    if (reviewSaving || reminderState === 'sending') return;
    setReviewTarget(null);
    setReviewError(false);
    setReminderStaffId(null);
    setReminderState('idle');
    setHelpOpen(false);
    onClose();
  }

  function openReminder(staffId: string) {
    setReminderStaffId(staffId);
    setReminderNonce(newReminderNonce());
    setReminderState('idle');
  }

  function closeReminder() {
    if (reminderState === 'sending') return;
    setReminderStaffId(null);
    setReminderState('idle');
  }

  async function sendReminder() {
    if (!reminderStaffId || reminderState === 'sending' || reminderState === 'sent') return;
    setReminderState('sending');
    try {
      const result = await sendShiftPreferenceReminderEmail({ employeeId: reminderStaffId, nonce: reminderNonce });
      setReminderState(result.status === 'success' ? result.data.delivery : 'error');
    } catch {
      setReminderState('error');
    }
  }

  const reminderStaffName = reminderStaffId ? staff.find((s) => s.staffId === reminderStaffId)?.name ?? '' : '';
  const reminderEmail = reminderStaffId ? buildShiftPreferenceReminderEmail(reminderStaffName, nextMonthPrefix(todayIso)) : null;
  const reminderNotice: { text: string; tone: 'success' | 'danger' } | null =
    reminderState === 'sent'
      ? { text: t('reminderSentNotice'), tone: 'success' }
      : reminderState === 'no_email'
        ? { text: t('reminderNoEmailNotice'), tone: 'danger' }
        : reminderState === 'not_configured'
          ? { text: t('reminderNotConfiguredNotice'), tone: 'danger' }
          : reminderState === 'send_failed' || reminderState === 'error'
            ? { text: t('reminderFailedNotice'), tone: 'danger' }
            : null;
  const reviewTargetReviewed = reviewTarget ? isReviewed(reviewTarget.request) : false;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={shiftRequestsHeadingValue[lang](monthLabel)}
      titleAdornment={<HelpIconButton ariaLabel={t('shiftRequestsPopupHelpAriaLabel')} onClick={() => setHelpOpen(true)} />}
      width="min(900px, 96vw)"
      closeLabel={t('cancel')}
    >
      <div role="group" aria-label={shiftRequestsHeadingValue[lang](monthLabel)} style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 10 }}>
        {(['next', 'current'] as const).map((choice) => {
          const active = monthChoice === choice;
          return (
            <button
              key={choice}
              type="button"
              aria-pressed={active}
              className={active ? undefined : hoverStyles.buttonSecondary}
              style={active ? { ...buttonPrimary, padding: '6px 14px' } : { ...buttonSecondary, padding: '6px 14px' }}
              onClick={() => selectMonth(choice)}
            >
              {t(choice === 'next' ? 'preferenceMonthNext' : 'preferenceMonthCurrent')}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 12 }}>
        <button
          type="button"
          className={clampedWeekIndex === 0 ? undefined : hoverStyles.buttonSecondary}
          style={{ ...buttonSecondary, minWidth: 56, padding: '8px 18px', ...(clampedWeekIndex === 0 ? { opacity: 0.4, cursor: 'default' } : {}) }}
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
          style={{ ...buttonSecondary, minWidth: 56, padding: '8px 18px', ...(clampedWeekIndex >= weeks.length - 1 ? { opacity: 0.4, cursor: 'default' } : {}) }}
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
                <th style={{ ...gridHeaderCellStyle, borderTopLeftRadius: 8 }}>{t('colStaff')}</th>
                {weekDates.map((date, dateIndex) => (
                  <th
                    key={date}
                    style={{
                      ...gridHeaderCellStyle,
                      ...(date === todayIso ? { background: colors.accentMuted } : {}),
                      ...(dateIndex === weekDates.length - 1 ? { borderTopRightRadius: 8 } : {}),
                    }}
                  >
                    {formatWeekday(date, lang)}
                    <br />
                    {date.slice(8)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activeStaff.map((s, staffIndex) => {
                const submitted = submittedEmployeeIds.has(s.staffId);
                const isLastRow = staffIndex === activeStaff.length - 1;
                return (
                  <tr key={s.staffId}>
                    <td style={{ ...gridCellStyle, ...(isLastRow ? { borderBottomLeftRadius: 8 } : {}) }}>
                      <span style={{ position: 'relative', display: 'block' }}>
                        {/* Reminders only ask for NEXT month's preferences (the only month Staff can still submit), so the name is a reminder button only in that view. */}
                        {!submitted && monthChoice === 'next' ? (
                          <button
                            type="button"
                            className={hoverStyles.staffNameCell}
                            style={{ width: '100%', minHeight: minTouchTarget, border: 0, cursor: 'pointer', padding: '6px 4px', font: 'inherit', fontWeight: 600, fontSize: 12.5, borderRadius: 6, boxSizing: 'border-box' }}
                            title={s.name}
                            aria-label={`${s.name}: ${t('sendReminderTitle')}`}
                            onClick={() => openReminder(s.staffId)}
                          >
                            {s.name}
                          </button>
                        ) : (
                          <span
                            className={hoverStyles.staffNameCell}
                            style={{
                              width: '100%',
                              minHeight: minTouchTarget,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              textAlign: 'center',
                              padding: '6px 4px',
                              fontWeight: 600,
                              fontSize: 12.5,
                              borderRadius: 6,
                              boxSizing: 'border-box',
                              cursor: 'default',
                            }}
                          >
                            {s.name}
                          </span>
                        )}
                        {!submitted ? (
                          <span aria-hidden="true" style={missingCornerStyle}>
                            !
                          </span>
                        ) : null}
                      </span>
                    </td>
                    {weekDates.map((date, dateIndex) => (
                      <td
                        key={date}
                        style={{
                          ...gridCellStyle,
                          ...(isLastRow && dateIndex === weekDates.length - 1 ? { borderBottomRightRadius: 8 } : {}),
                        }}
                      >
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

      {weekLegendTypes.length > 0 || weekHasCustom || weekHasUnavailable ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
          {weekLegendTypes.map((st) => (
            <span key={st.shiftTypeId} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={shiftChipStyle(shiftChipColors(st.shiftTypeId, activeShiftTypeIds))}>{shiftTypeDisplayLabel(st)}</span>
              <span style={{ ...mutedText, fontSize: 12 }}>{st.startsAtLocal}-{st.endsAtLocal}</span>
            </span>
          ))}
          {weekHasCustom ? <span style={shiftChipStyle(CUSTOM_CHIP_TONE)}>{t('shiftTypeCustom')}</span> : null}
          {weekHasUnavailable ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={shiftChipStyle(UNAVAILABLE_CHIP_TONE)}>{t('preferenceUnavailableChip')}</span>
              <span style={{ ...mutedText, fontSize: 12 }}>{t('markedUnavailableHint')}</span>
            </span>
          ) : null}
        </div>
      ) : null}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
        <span style={{ fontSize: 13, ...mutedText }}>{shiftRequestsSummaryLabel[lang](submittedCount, totalCount, missingCount)}</span>
      </div>

      <Modal open={helpOpen} onClose={() => setHelpOpen(false)} title={t('shiftRequestsPopupHelpTitle')} closeLabel={t('cancel')} width="min(480px, 94vw)">
        <div style={{ whiteSpace: 'pre-line' }}>{t('shiftRequestsPopupHelpBody')}</div>
      </Modal>

      <Modal
        open={reviewTarget !== null}
        onClose={() => {
          if (!reviewSaving) setReviewTarget(null);
        }}
        title={t(reviewTargetReviewed ? 'reviewedPreferenceTitle' : 'reviewPreferenceTitle')}
        closeLabel={t('cancel')}
        width="min(420px, 94vw)"
      >
        {reviewTarget ? (
          <div>
            <p style={{ margin: 0, fontWeight: 600 }}>{staff.find((s) => s.staffId === reviewTarget.staffId)?.name ?? ''}</p>
            <p style={{ margin: '4px 0 0', ...mutedText }}>
              {reviewTarget.date} ·{' '}
              {reviewTarget.request.isUnavailable
                ? t('markedUnavailableHint')
                : reviewTarget.request.shiftTypeId && shiftTypeById.get(reviewTarget.request.shiftTypeId)
                  ? shiftTypeDisplayLabel(shiftTypeById.get(reviewTarget.request.shiftTypeId)!)
                  : t('shiftTypeCustom')}
            </p>
            <p style={{ margin: '12px 0 0', whiteSpace: 'pre-line', fontSize: 13, ...mutedText }}>
              {t(reviewTargetReviewed ? 'reviewedPreferenceBody' : 'priorityExplainerBody')}
            </p>
            {reviewError ? (
              <p role="alert" style={{ ...alertDanger, margin: '12px 0 0' }}>
                {t('reviewSaveFailed')}
              </p>
            ) : null}
            <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
              <button
                type="button"
                className={reviewSaving ? undefined : reviewTargetReviewed ? hoverStyles.buttonSecondary : hoverStyles.buttonPrimary}
                style={reviewSaving ? buttonDisabled : reviewTargetReviewed ? buttonSecondary : buttonPrimary}
                disabled={reviewSaving}
                onClick={() => void saveReview(reviewTarget.request, !reviewTargetReviewed)}
              >
                {reviewSaving ? t('saving') : t(reviewTargetReviewed ? 'unmarkReviewedButton' : 'markReviewedButton')}
              </button>
              <button
                type="button"
                className={hoverStyles.buttonSecondary}
                style={buttonSecondary}
                disabled={reviewSaving}
                onClick={() => setReviewTarget(null)}
              >
                {t(reviewTargetReviewed ? 'close' : 'cancel')}
              </button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal open={reminderStaffId !== null} onClose={closeReminder} title={t('sendReminderTitle')} closeLabel={t('cancel')} width="min(480px, 94vw)">
        <p style={{ margin: 0, fontWeight: 600 }}>{reminderStaffName}</p>
        <p style={{ margin: '6px 0 0', fontSize: 13, ...mutedText }}>{t('sendReminderBody')}</p>
        {reminderEmail ? (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 600, ...mutedText }}>{t('reminderPreviewLabel')}</div>
            <div
              style={{
                margin: '4px 0 0',
                padding: '10px 12px',
                borderRadius: 8,
                border: `1px solid ${colors.border}`,
                background: colors.surfaceElevated,
                fontSize: 12.5,
                whiteSpace: 'pre-line',
                maxHeight: 220,
                overflowY: 'auto',
                overflowWrap: 'anywhere',
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 8 }}>{reminderEmail.subject}</div>
              {reminderEmail.text}
            </div>
          </div>
        ) : null}
        {reminderNotice ? (
          <p
            role={reminderNotice.tone === 'danger' ? 'alert' : 'status'}
            style={
              reminderNotice.tone === 'danger'
                ? { ...alertDanger, margin: '12px 0 0' }
                : { margin: '12px 0 0', fontSize: 13, fontWeight: 600, color: colors.success }
            }
          >
            {reminderNotice.text}
          </p>
        ) : null}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
          {reminderState === 'sent' ? null : (
            <button
              type="button"
              className={reminderState === 'sending' ? undefined : hoverStyles.buttonPrimary}
              style={reminderState === 'sending' ? buttonDisabled : buttonPrimary}
              disabled={reminderState === 'sending'}
              onClick={() => void sendReminder()}
            >
              {reminderState === 'sending' ? t('sendingReminder') : t('sendReminderButton')}
            </button>
          )}
          <button
            type="button"
            className={hoverStyles.buttonSecondary}
            style={buttonSecondary}
            disabled={reminderState === 'sending'}
            onClick={closeReminder}
          >
            {t(reminderState === 'sent' ? 'close' : 'cancel')}
          </button>
        </div>
      </Modal>
    </Modal>
  );
}
