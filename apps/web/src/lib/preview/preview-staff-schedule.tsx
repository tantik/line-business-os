'use client';

import { useMemo, useRef, useState } from 'react';
import { DemoHelpButton } from '@/components/demo/cafe/DemoHelpButton';
import { Modal } from '@/components/demo/cafe/Modal';
import { ShiftLegend } from '@/components/demo/cafe/ShiftLegend';
import { ShiftTable } from '@/components/demo/cafe/ShiftTable';
import { CafeStaffScheduleCard } from '@/components/demo/cafe/CafeStaffPresentation';
import { HELP_STAFF_SHIFT_TABLE } from '@/lib/demo/cafe/helpContent';
import type { ShiftAssignment, ShiftTypeDef, WorkReport } from '@/lib/demo/cafe/types';
import type { WorkforceAttendance } from '@/lib/workforce/attendance';
import type { WorkforceMyStaffProfile } from '@/lib/workforce/staff-profile';
import type { WorkforceShiftType } from '@/lib/workforce/shift-types';
import type { WorkforceShiftAssignment } from '@/lib/workforce/shift-assignments';
import type { WorkforceShiftRequest } from '@/lib/workforce/shift-requests';
import type { WorkforceShiftExchange } from '@/lib/workforce/shift-exchanges';
import { addIsoDays, utcIsoToLocalDateTime } from '@/lib/workforce/timezone';
import { buttonDisabled, buttonPrimary, buttonSecondary, demoColors, mutedText } from '@/lib/demo/cafe/theme';
import { todayIsoInTimeZone } from '@/app/(protected)/dashboard/workforce/_ui/workforce-theme';
import { PreviewCorrectionRequestForm } from './preview-correction-request-form';
import { PreviewWorkReportForm } from './preview-work-report-form';
import { PreviewShiftExchangeRequestForm } from './preview-shift-exchange-request-form';
import { useLang } from '@/lib/demo/cafe/i18n';
import { tStaff } from '@/lib/demo/cafe/i18n.staff';
import { estimatedEarningsSummary } from '@/lib/workforce/estimated-earnings';

export interface PreviewStaffScheduleProps {
  timeZone: string;
  periodStart: string;
  periodEnd: string;
  weekOffset: number;
  profile: WorkforceMyStaffProfile;
  shiftTypes: WorkforceShiftType[] | null;
  assignments: WorkforceShiftAssignment[] | null;
  attendance: WorkforceAttendance[] | null;
  requests: WorkforceShiftRequest[] | null;
  exchanges: WorkforceShiftExchange[] | null;
  basePath: string;
}

function dateRange(periodStart: string, periodEnd: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${periodStart}T00:00:00.000Z`);
  const end = new Date(`${periodEnd}T00:00:00.000Z`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function reportTime(value: string | null, timeZone: string): string {
  return value ? utcIsoToLocalDateTime(value, timeZone).localTime : '－';
}

/** Real-data Staff schedule with the same all/self interaction as Demo. */
export function PreviewStaffSchedule({
  timeZone,
  periodStart,
  periodEnd,
  weekOffset,
  profile,
  shiftTypes,
  assignments,
  attendance,
  requests,
  exchanges,
  basePath,
}: PreviewStaffScheduleProps) {
  const { lang } = useLang();
  const t = (key: Parameters<typeof tStaff>[1]) => tStaff(lang, key);
  const [onlyMe, setOnlyMe] = useState(false);
  const [activeWeekOffset, setActiveWeekOffset] = useState(weekOffset);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [correctionDate, setCorrectionDate] = useState<string | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const activePeriodStart = addIsoDays(periodStart, (activeWeekOffset - weekOffset) * 7);
  const activePeriodEnd = addIsoDays(periodEnd, (activeWeekOffset - weekOffset) * 7);
  const dates = useMemo(() => dateRange(activePeriodStart, activePeriodEnd), [activePeriodStart, activePeriodEnd]);
  const todayIso = todayIsoInTimeZone(timeZone);
  const monthlySummary = estimatedEarningsSummary(attendance ?? [], todayIso.slice(0, 7), profile.hourlyWageYen);

  function goToWeek(nextOffset: number) {
    const bounded = Math.max(-8, Math.min(8, nextOffset));
    setActiveWeekOffset(bounded);
    const suffix = bounded === 0 ? '' : `?weekOffset=${bounded}`;
    window.history.replaceState(null, '', `${basePath}${suffix}`);
  }

  const referencedShiftTypeIds = new Set(
    (assignments ?? [])
      .filter((item) => {
        if (!item.published || !item.employeeId || !item.shiftTypeId) return false;
        const workDate = utcIsoToLocalDateTime(item.startsAt, timeZone).workDate;
        return dates.includes(workDate);
      })
      .map((item) => item.shiftTypeId as string),
  );
  const displayShiftTypes: ShiftTypeDef[] = (shiftTypes ?? [])
    .filter((shiftType) => shiftType.isActive || referencedShiftTypeIds.has(shiftType.shiftTypeId))
    .map((shiftType) => ({
    id: shiftType.shiftTypeId,
    label: shiftType.labelJa,
    startTime: shiftType.startsAtLocal.slice(0, 5),
    endTime: shiftType.endsAtLocal.slice(0, 5),
    isCustom: shiftType.isCustom,
    }));

  const employeeIds = Array.from(
    new Set((assignments ?? []).filter((item) => item.published && item.employeeId).map((item) => item.employeeId!)),
  );
  employeeIds.sort((a, b) => (a === profile.staffId ? -1 : b === profile.staffId ? 1 : a.localeCompare(b)));
  if (!employeeIds.includes(profile.staffId)) employeeIds.unshift(profile.staffId);

  // Other employees' encrypted names are deliberately not exposed to Staff.
  // Stable neutral labels preserve the full-roster schedule without leaking PII.
  let colleagueNumber = 0;
  const staffList = employeeIds.map((id) => ({
    id,
    name: id === profile.staffId ? t('me') : `${t('staffNumberPrefix')} ${++colleagueNumber}`,
    role: 'staff' as const,
  }));

  const displayAssignments: ShiftAssignment[] = [];
  for (const assignment of assignments ?? []) {
    if (!assignment.published || !assignment.employeeId) continue;
    const start = utcIsoToLocalDateTime(assignment.startsAt, timeZone);
    if (!dates.includes(start.workDate)) continue;
    displayAssignments.push({
      staffId: assignment.employeeId,
      date: start.workDate,
      shiftTypeId: assignment.shiftTypeId,
    });
  }

  const selectedAttendance = (attendance ?? []).find((entry) => entry.workDate === selectedDate) ?? null;
  const selectedAssignment = (assignments ?? []).find((entry) => {
    if (entry.employeeId !== profile.staffId) return false;
    return utcIsoToLocalDateTime(entry.startsAt, timeZone).workDate === selectedDate;
  });
  const selectedShift = displayShiftTypes.find((entry) => entry.id === selectedAssignment?.shiftTypeId);
  const existingExchangeForSelected = selectedAssignment
    ? (exchanges ?? []).find(
        (exchange) => exchange.shiftId === selectedAssignment.assignmentId && exchange.status !== 'rejected' && exchange.status !== 'cancelled',
      )
    : undefined;
  const canRequestExchange = Boolean(
    selectedAssignment &&
      selectedAssignment.published &&
      new Date(selectedAssignment.startsAt).getTime() > Date.now() &&
      !existingExchangeForSelected,
  );
  const correctionByDate = new Map(
    (requests ?? [])
      .filter((request) => request.kind === 'correction')
      .map((request) => [request.workDate, request] as const),
  );
  const workReports: WorkReport[] = (attendance ?? []).filter((entry) => Boolean(entry.clockOut)).map((entry) => {
    const correction = correctionByDate.get(entry.workDate);
    return {
      staffId: profile.staffId,
      date: entry.workDate,
      plannedLabel: '',
      actualClockIn: entry.clockIn ? reportTime(entry.clockIn, timeZone) : null,
      breakMinutes: entry.actualBreakMinutes ?? 0,
      actualClockOut: entry.clockOut ? reportTime(entry.clockOut, timeZone) : null,
      actualWorkedHours: null,
      transportYen: entry.transportationCost ?? 0,
      message: entry.dailyMessage ?? '',
      hasCorrectionRequest: Boolean(correction),
      correctionRequest: correction
        ? {
            requestedClockIn: typeof correction.details.clockInLocal === 'string' ? correction.details.clockInLocal : undefined,
            requestedClockOut: typeof correction.details.clockOutLocal === 'string' ? correction.details.clockOutLocal : undefined,
            requestedBreakMinutes: typeof correction.details.actualBreakMinutes === 'number' ? correction.details.actualBreakMinutes : undefined,
            reason: typeof correction.details.message === 'string' ? correction.details.message : '',
            status: correction.status === 'approved' || correction.status === 'rejected' ? correction.status : 'pending',
          }
        : undefined,
    };
  });
  const selectedCorrection = selectedDate ? correctionByDate.get(selectedDate) : undefined;
  const messageLocked = selectedCorrection?.status === 'approved';
  const attentionCellKeys = new Set<string>();
  for (const request of requests ?? []) {
    if (request.status === 'pending' && request.kind === 'correction') attentionCellKeys.add(`${profile.staffId}:${request.workDate}`);
  }
  for (const exchange of exchanges ?? []) {
    if (!['open', 'accepted'].includes(exchange.status)) continue;
    const assignment = (assignments ?? []).find((item) => item.assignmentId === exchange.shiftId);
    if (assignment) attentionCellKeys.add(`${profile.staffId}:${utcIsoToLocalDateTime(assignment.startsAt, timeZone).workDate}`);
  }

  return (
    <>
      <div
        onTouchStart={(event) => {
          const touch = event.changedTouches[0];
          if (touch) touchStart.current = { x: touch.clientX, y: touch.clientY };
        }}
        onTouchEnd={(event) => {
          const start = touchStart.current;
          const touch = event.changedTouches[0];
          touchStart.current = null;
          if (!start || !touch) return;
          const deltaX = touch.clientX - start.x;
          const deltaY = touch.clientY - start.y;
          if (Math.abs(deltaX) < 55 || Math.abs(deltaX) <= Math.abs(deltaY)) return;
          goToWeek(activeWeekOffset + (deltaX < 0 ? 1 : -1));
        }}
      >
      <CafeStaffScheduleCard
        title={
          <>
            {t('shiftTable')} <DemoHelpButton content={HELP_STAFF_SHIFT_TABLE} />
          </>
        }
        headerActions={
          <div style={{ display: 'inline-flex', border: `1px solid ${demoColors.border}`, borderRadius: 999, overflow: 'hidden' }}>
            <button type="button" onClick={() => setOnlyMe(false)} style={{ ...buttonSecondary, border: 0, borderRadius: 0, background: !onlyMe ? demoColors.accent : 'transparent', color: !onlyMe ? '#fff' : demoColors.textMuted, padding: '6px 14px' }}>{t('all')}</button>
            <button type="button" onClick={() => setOnlyMe(true)} style={{ ...buttonSecondary, border: 0, borderRadius: 0, background: onlyMe ? demoColors.accent : 'transparent', color: onlyMe ? '#fff' : demoColors.textMuted, padding: '6px 14px' }}>{t('onlyMe')}</button>
          </div>
        }
        schedule={
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: demoColors.textPrimary }}>
                {activePeriodStart.slice(5).replace('-', '/')} ～ {activePeriodEnd.slice(5).replace('-', '/')}
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button type="button" onClick={() => goToWeek(activeWeekOffset - 1)} disabled={activeWeekOffset <= -8} style={{ ...(activeWeekOffset <= -8 ? buttonDisabled : buttonSecondary), padding: '5px 9px', fontSize: 11 }}>← {t('prevWeek')}</button>
                <button type="button" onClick={() => goToWeek(0)} disabled={activeWeekOffset === 0} style={{ ...(activeWeekOffset === 0 ? buttonDisabled : buttonSecondary), padding: '5px 9px', fontSize: 11 }}>{t('today')}</button>
                <button type="button" onClick={() => goToWeek(activeWeekOffset + 1)} disabled={activeWeekOffset >= 8} style={{ ...(activeWeekOffset >= 8 ? buttonDisabled : buttonSecondary), padding: '5px 9px', fontSize: 11 }}>{t('nextWeek')} →</button>
              </div>
            </div>
            {assignments === null ? (
              <p style={{ margin: '8px 4px', ...mutedText }}>{t('scheduleLoadError')}</p>
            ) : (
              <ShiftTable
                dates={dates}
                todayIso={todayIso}
                staffList={staffList}
                assignments={displayAssignments}
                shiftTypes={displayShiftTypes}
                mode="staff"
                currentStaffId={profile.staffId}
                workReports={workReports}
                onlyCurrentStaff={onlyMe}
                compact
                lang={lang}
                selectedCell={selectedDate ? { staffId: profile.staffId, date: selectedDate } : null}
                attentionCellKeys={attentionCellKeys}
                onCellClick={(staffId, date) => {
                  if (staffId !== profile.staffId) return;
                  const report = (attendance ?? []).find((entry) => entry.workDate === date);
                  if (date === todayIso && !report?.clockOut) return;
                  setSelectedDate(date);
                }}
              />
            )}
          </>
        }
        legend={<ShiftLegend shiftTypes={displayShiftTypes} lang={lang} />}
        hoursLabel={
          <span style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px' }}>
            <span>{lang === 'ja' ? '今月の実働' : 'Worked this month'}: {monthlySummary.workedHours.toFixed(1)} h</span>
            <span>{lang === 'ja' ? '時給' : 'Hourly'}: {monthlySummary.hourlyWageYen === null ? '—' : `¥${monthlySummary.hourlyWageYen.toLocaleString('ja-JP')}`}</span>
            <span>{lang === 'ja' ? '概算給与' : 'Estimated earnings'}: {monthlySummary.estimatedEarningsYen === null ? '—' : `¥${monthlySummary.estimatedEarningsYen.toLocaleString('ja-JP')}`}</span>
          </span>
        }
      />
      </div>

      <Modal
        open={selectedDate !== null}
        onClose={() => {
          setSelectedDate(null);
        }}
        title={selectedDate && selectedDate > todayIso
          ? (lang === 'ja' ? `シフト変更・キャンセル申請 ${selectedDate}` : `Request a shift change or cancellation · ${selectedDate}`)
          : `${t('workReportTitle')} ${selectedDate ?? ''}`}
      >
        <div style={{ display: 'grid', gap: 0 }}>
          {[
            [t('plannedShift'), selectedShift ? `${selectedShift.label}（${selectedShift.startTime}-${selectedShift.endTime}）` : t('dash')],
            [t('reportClockIn'), reportTime(selectedAttendance?.clockIn ?? null, timeZone)],
            [t('breakMinutesLabel'), `${selectedAttendance?.actualBreakMinutes ?? 0}${t('minutesSuffix')}`],
            [t('reportClockOut'), reportTime(selectedAttendance?.clockOut ?? null, timeZone)],
            [t('transport'), selectedAttendance?.transportationCost == null ? t('dash') : `¥${selectedAttendance.transportationCost}`],
          ].map(([label, value]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: `1px solid ${demoColors.border}` }}>
              <span style={mutedText}>{label}</span><strong>{value}</strong>
            </div>
          ))}
          {selectedAttendance?.dailyMessage ? <section
            style={{
              marginTop: 16,
              padding: 14,
              border: `1px solid ${demoColors.border}`,
              borderLeft: `4px solid ${demoColors.accent}`,
              borderRadius: 10,
              background: demoColors.surfaceElevated,
            }}
          >
            <div style={{ marginBottom: 8, fontSize: 14, fontWeight: 800 }}>{t('message')}</div>
              <>
                <PreviewWorkReportForm
                  defaultWorkDate={selectedAttendance.workDate}
                  defaultTransportationCost={selectedAttendance.transportationCost}
                  defaultDailyMessage={selectedAttendance.dailyMessage}
                  embedded
                  hideWorkDate
                  messageOnly
                  locked={messageLocked}
                />
                <p style={{ margin: '8px 0 0', ...mutedText, fontSize: 12 }}>
                  {messageLocked ? t('lockedAfterManagerConfirm') : t('editableBeforeManagerConfirm')}
                </p>
              </>
          </section> : null}
        </div>
        {selectedDate && selectedDate <= todayIso ? (
          <button type="button" style={{ ...buttonPrimary, marginTop: 12 }} onClick={() => { setCorrectionDate(selectedDate); setSelectedDate(null); }}>{t('requestCorrection')}</button>
        ) : null}
        {canRequestExchange && selectedAssignment ? (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${demoColors.border}` }}>
            <PreviewShiftExchangeRequestForm
              shiftId={selectedAssignment.assignmentId}
              shiftTypes={shiftTypes ?? []}
              onSuccess={() => setSelectedDate(null)}
            />
          </div>
        ) : null}
      </Modal>

      <Modal open={correctionDate !== null} onClose={() => setCorrectionDate(null)} title={t('correctionModalTitle')}>
        <PreviewCorrectionRequestForm
          defaultWorkDate={correctionDate ?? todayIso}
          defaultAttendance={(attendance ?? []).find((entry) => entry.workDate === correctionDate) ?? null}
          timeZone={timeZone}
          embedded
          onSuccess={() => setCorrectionDate(null)}
        />
      </Modal>
    </>
  );
}
