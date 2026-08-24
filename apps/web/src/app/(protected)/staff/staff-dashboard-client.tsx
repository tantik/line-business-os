'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { WorkforceMyStaffProfile } from '@/lib/workforce/staff-profile';
import { shiftTypeDisplayLabel, type WorkforceShiftType } from '@/lib/workforce/shift-types';
import type { WorkforceShiftRequest } from '@/lib/workforce/shift-requests';
import type { WorkforceShiftAssignment } from '@/lib/workforce/shift-assignments';
import type { WorkforceShiftExchange } from '@/lib/workforce/shift-exchanges';
import type { WorkforceAttendance } from '@/lib/workforce/attendance';
import type { InventoryItemStatus } from '@/lib/inventory/items';
import { utcIsoToLocalDateTime } from '@/lib/workforce/timezone';
import { getMyScheduleWeek } from '@/lib/workforce/schedule-actions';
import {
  buildStaffScheduleRoster,
  computeStaffAttentionCellKeys,
  toStaffViewAssignments,
  toStaffViewShiftTypes,
} from '@/lib/workforce/staff-schedule-view-model';
import { ShiftTable } from '@/components/demo/cafe/ShiftTable';
import { ShiftLegend } from '@/components/demo/cafe/ShiftLegend';
import { Modal } from '@/components/demo/cafe/Modal';
import { LangProvider, useLang } from '@/lib/demo/cafe/i18n';
import { existingExchangeMessage, scheduledThisWeekValue, tStaffDashboard } from './staff-dashboard-i18n';
import { buttonDisabled, buttonPrimary, buttonSecondary, card, colors, mutedText } from '@/lib/ui/theme';
import { primaryCard, todayIsoInTimeZone } from '../_ui/workforce-theme';
import { EntryPointsCard } from '../_ui/entry-points-card';
import { BrandBadge } from '../_ui/brand-badge';
import { ShiftExchangeRequestForm } from './shift-exchange-request-form';
import { WorkStatusCard } from './work-status-card';
import { TransportMessageForm } from './transport-message-form';
import { MonthlyShiftPreferenceModal } from './monthly-shift-preference-modal';
import { AccountMenu } from '../_ui/account-menu';

/** Manager -> Staff live-sync poll interval, matching `_client-preview`'s `PreviewStaffSchedule` (Founder P1, 2026-08-13, Contract 3): targets the single displayed week only, never the whole page. */
const SCHEDULE_POLL_INTERVAL_MS = 2500;

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

const alertSuccess = {
  border: `1px solid ${colors.success}`,
  background: colors.successMuted,
  color: colors.success,
  borderRadius: 8,
  padding: '8px 12px',
  fontSize: 14,
} as const;

export interface StaffDashboardClientProps {
  tenantName: string;
  locationName: string;
  timeZone: string;
  periodStart: string;
  periodEnd: string;
  weekOffset: number;
  profile: WorkforceMyStaffProfile;
  /** The caller's own real display name, decrypted server-side via `api.workforce_staff_roster` (0061). `null` only if the roster read itself failed -- falls back to no name shown, never a placeholder. */
  displayName: string | null;
  /** Every visible coworker's (plus the caller's own) real display name, keyed by employee id -- same source as `displayName`, threaded through to the schedule grid so it can show real names instead of synthesized "Staff N" labels. */
  staffNameById: Record<string, string>;
  shiftTypes: WorkforceShiftType[] | null;
  /** The caller's own `kind: 'preference'` shift requests (self-scoped by RLS), not date-filtered by the caller. */
  requests: WorkforceShiftRequest[] | null;
  /**
   * The full ±8-week, this-location, PUBLISHED assignment window (every
   * employee, not just the caller) -- already narrowed server-side
   * (`page.tsx`) to `published && locationId === <this location>`. Powers
   * the coworker-roster/self-pin/self-highlight/All-Only-me schedule grid
   * below (`ShiftTable`), mirroring `_client-preview`'s `windowAssignments`.
   * RLS on `api.workforce_shift_assignments` remains the real boundary; a
   * plain Staff reader is already limited to published rows tenant-wide.
   */
  assignments: WorkforceShiftAssignment[] | null;
  /** The caller's own attendance rows (self-scoped by RLS), not date-filtered by the caller. */
  attendance: WorkforceAttendance[] | null;
  /** The caller's own `kind: 'correction'` shift requests (self-scoped by RLS), not date-filtered by the caller. */
  correctionRequests: WorkforceShiftRequest[] | null;
  /** This location's shift-exchange requests (RLS-scoped to the caller's tenant/location; a plain Staff reader sees requester/replacement rows they're a party to plus open offers, per `api.workforce_shift_exchanges`). */
  exchanges: WorkforceShiftExchange[] | null;
  /** Whether the tenant's separate `inventory` top-level module (ADR 0010) is enabled -- gates only the entry-point card below; the real Inventory page/RLS remain the authorization boundary. */
  inventoryEnabled: boolean;
  /** This location's inventory item statuses, read-only, for the entry-point card's shortage summary. The actual catalog/count-entry UI lives on the existing canonical `/dashboard/inventory` page (shared Staff+Manager), not duplicated here. `null` when the module is disabled or the read failed. */
  inventoryItems: InventoryItemStatus[] | null;
}

/** Display-only hours between two `HH:MM` local times, for the weekly-hours summary. Does not account for breaks. */
function hoursBetween(startsAtLocal: string, endsAtLocal: string): number {
  const [startH = 0, startM = 0] = startsAtLocal.split(':').map(Number);
  const [endH = 0, endM = 0] = endsAtLocal.split(':').map(Number);
  return (endH * 60 + endM - (startH * 60 + startM)) / 60;
}

/**
 * Outer wrapper: mounts the one shared `LangProvider` (`@/lib/demo/cafe/i18n`,
 * the same JA/EN mechanism `_client-preview` uses) around the whole Staff
 * page body, so `StaffDashboardBody` and everything it renders (`ShiftTable`,
 * `ShiftLegend`, `Modal`, `ShiftExchangeRequestForm`, the language toggle
 * itself) can call `useLang()`/receive a `lang` prop. Split out because a
 * component cannot call `useLang()` above its own `LangProvider` ancestor.
 */
export function StaffDashboardClient(props: StaffDashboardClientProps) {
  return (
    <LangProvider>
      <StaffDashboardBody {...props} />
    </LangProvider>
  );
}

function StaffDashboardBody({
  tenantName,
  locationName,
  timeZone,
  periodStart,
  periodEnd,
  weekOffset,
  profile,
  displayName,
  staffNameById,
  shiftTypes,
  requests,
  assignments,
  attendance,
  correctionRequests,
  exchanges,
}: StaffDashboardClientProps) {
  const router = useRouter();
  const { lang } = useLang();
  const t = (key: Parameters<typeof tStaffDashboard>[1]) => tStaffDashboard(lang, key);
  const [banner, setBanner] = useState<string | null>(null);
  const [onlyMe, setOnlyMe] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [monthlyModalOpen, setMonthlyModalOpen] = useState(false);

  const shiftTypeById = useMemo(() => new Map((shiftTypes ?? []).map((st) => [st.shiftTypeId, st])), [shiftTypes]);

  // The full ±8-week, this-location window seeded once from the initial page
  // load's `assignments` prop, then spliced with a background poll of just
  // the currently displayed week (`getMyScheduleWeek`) -- same pattern
  // `_client-preview`'s `PreviewStaffSchedule` uses -- so a Manager's publish
  // becomes visible here without a manual reload.
  const [windowAssignments, setWindowAssignments] = useState<WorkforceShiftAssignment[]>(assignments ?? []);

  useEffect(() => {
    setWindowAssignments(assignments ?? []);
  }, [assignments]);

  useEffect(() => {
    if (assignments === null) return;
    let cancelled = false;
    let inFlight = false;
    const poll = async () => {
      if (inFlight || document.visibilityState !== 'visible') return;
      inFlight = true;
      try {
        const result = await getMyScheduleWeek(weekOffset);
        if (cancelled || result.status !== 'success') return;
        const fetchedDateSet = new Set(dateRange(result.data.periodStart, result.data.periodEnd));
        setWindowAssignments((prev) => [
          ...prev.filter((a) => !fetchedDateSet.has(utcIsoToLocalDateTime(a.startsAt, timeZone).workDate)),
          ...result.data.assignments,
        ]);
      } finally {
        inFlight = false;
      }
    };
    const id = setInterval(poll, SCHEDULE_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [weekOffset, timeZone, assignments]);

  const dates = useMemo(() => dateRange(periodStart, periodEnd), [periodStart, periodEnd]);

  const staffList = useMemo(
    () =>
      buildStaffScheduleRoster(
        windowAssignments,
        profile.staffId,
        { me: t('meLabel'), colleaguePrefix: t('colleaguePrefixLabel') },
        staffNameById,
      ),
    [windowAssignments, profile.staffId, lang, staffNameById],
  );
  const displayShiftTypes = useMemo(
    () => toStaffViewShiftTypes(shiftTypes ?? [], windowAssignments, dates, timeZone),
    [shiftTypes, windowAssignments, dates, timeZone],
  );
  const displayAssignments = useMemo(
    () => toStaffViewAssignments(windowAssignments, dates, timeZone),
    [windowAssignments, dates, timeZone],
  );
  const attentionCellKeys = useMemo(
    () => computeStaffAttentionCellKeys(correctionRequests ?? [], exchanges ?? [], windowAssignments, profile.staffId, timeZone),
    [correctionRequests, exchanges, windowAssignments, profile.staffId, timeZone],
  );

  const selectedAssignment = useMemo(() => {
    if (!selectedDate) return undefined;
    return windowAssignments.find(
      (entry) => entry.employeeId === profile.staffId && utcIsoToLocalDateTime(entry.startsAt, timeZone).workDate === selectedDate,
    );
  }, [selectedDate, windowAssignments, profile.staffId, timeZone]);
  const existingExchangeForSelected = useMemo(() => {
    if (!selectedAssignment) return undefined;
    return (exchanges ?? []).find(
      (exchange) =>
        exchange.shiftId === selectedAssignment.assignmentId && exchange.status !== 'rejected' && exchange.status !== 'cancelled',
    );
  }, [exchanges, selectedAssignment]);
  const canRequestExchange = Boolean(
    selectedAssignment &&
      selectedAssignment.published &&
      new Date(selectedAssignment.startsAt).getTime() > Date.now() &&
      !existingExchangeForSelected,
  );
  const selectedAttendance = useMemo(
    () => (attendance ?? []).find((entry) => entry.workDate === selectedDate) ?? null,
    [attendance, selectedDate],
  );

  // Staff must only ever see their own, published shifts in the weekly-hours summary here -- never a co-worker's row, never a manager's unpublished draft.
  const myScheduleThisWeek = useMemo(() => {
    return windowAssignments
      .filter((a) => a.published && a.employeeId === profile.staffId)
      .map((a) => {
        const start = utcIsoToLocalDateTime(a.startsAt, timeZone);
        const end = utcIsoToLocalDateTime(a.endsAt, timeZone);
        return { assignment: a, workDate: start.workDate, startsAtLocal: start.localTime, endsAtLocal: end.localTime };
      })
      .filter((entry) => entry.workDate >= periodStart && entry.workDate <= periodEnd)
      .sort((a, b) => a.workDate.localeCompare(b.workDate) || a.startsAtLocal.localeCompare(b.startsAtLocal));
  }, [windowAssignments, profile.staffId, timeZone, periodStart, periodEnd]);

  const todayIso = useMemo(() => todayIsoInTimeZone(timeZone), [timeZone]);

  const todayAttendance = useMemo(() => (attendance ?? []).find((a) => a.workDate === todayIso) ?? null, [attendance, todayIso]);

  const weeklyHours = useMemo(
    () => myScheduleThisWeek.reduce((sum, entry) => sum + hoursBetween(entry.startsAtLocal, entry.endsAtLocal), 0),
    [myScheduleThisWeek],
  );

  function handleFormSuccess(message: string) {
    setBanner(message);
    router.refresh();
  }

  return (
    <>
      <header
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 10,
          paddingBottom: 14,
          borderBottom: `1px solid ${colors.border}`,
        }}
      >
        {/* `minWidth: 0` + `overflowWrap: anywhere` let a long tenant/location name wrap onto further lines within this block
            instead of the header row falling back to its `flexWrap` and pushing the account menu onto its own row (Founder
            header redesign, 2026-08-24: identity moves to the account menu on the right, this side is tenant + location only,
            matching the multi-location mockup -- "ORUWA Cafe" / "Main Store" -- and no longer "Staff -- {name}"). */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: '1 1 auto' }}>
          <BrandBadge label={tenantName} />
          <div style={{ minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: colors.textPrimary, overflowWrap: 'anywhere' }}>{tenantName}</h1>
            <p style={{ margin: '2px 0 0', fontSize: 13, overflowWrap: 'anywhere', ...mutedText }}>{locationName}</p>
          </div>
        </div>
        <AccountMenu
          displayName={displayName ?? t('pageTitle')}
          positionLabel={profile.positionLabel ?? t('notSetLabel')}
          signOutLabel={t('signOut')}
        />
      </header>

      <WorkStatusCard todayAttendance={todayAttendance} timeZone={timeZone} lang={lang} />

      <EntryPointsCard
        heading={t('entryPointsHeading')}
        buttons={[
          { key: 'recipes', label: t('navRecipes'), href: '/recipes' },
          { key: 'inventory', label: t('navInventory'), href: '/inventory' },
          { key: 'purchases', label: t('navPurchases'), href: '/purchases' },
        ]}
      />

      {banner ? <div style={{ ...alertSuccess, marginTop: 16 }}>{banner}</div> : null}

      <section style={primaryCard}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>
            {t('scheduleHeading')} ({periodStart} - {periodEnd})
          </h2>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'inline-flex', border: `1px solid ${colors.border}`, borderRadius: 8, overflow: 'hidden' }}>
              <button
                type="button"
                onClick={() => setOnlyMe(false)}
                style={{ ...buttonSecondary, border: 0, borderRadius: 0, background: !onlyMe ? colors.accent : 'transparent', color: !onlyMe ? '#fff' : colors.textMuted, padding: '6px 14px' }}
              >
                {t('all')}
              </button>
              <button
                type="button"
                onClick={() => setOnlyMe(true)}
                style={{ ...buttonSecondary, border: 0, borderRadius: 0, background: onlyMe ? colors.accent : 'transparent', color: onlyMe ? '#fff' : colors.textMuted, padding: '6px 14px' }}
              >
                {t('onlyMe')}
              </button>
            </div>
            <Link href={`/staff?weekOffset=${weekOffset - 1}`} style={buttonSecondary}>
              {t('prevWeek')}
            </Link>
            <Link
              href="/staff"
              style={weekOffset === 0 ? buttonDisabled : buttonSecondary}
              aria-disabled={weekOffset === 0}
            >
              {t('thisWeek')}
            </Link>
            <Link href={`/staff?weekOffset=${weekOffset + 1}`} style={buttonSecondary}>
              {t('nextWeek')}
            </Link>
          </div>
        </div>
        {assignments === null ? (
          <p style={{ margin: '8px 0 0', ...mutedText }}>{t('scheduleUnavailable')}</p>
        ) : (
          <>
            <p style={{ margin: '12px 0 0', fontSize: 14, fontWeight: 600, color: colors.textPrimary }}>
              {scheduledThisWeekValue[lang](weeklyHours.toFixed(1))}
            </p>
            <div style={{ marginTop: 8 }}>
              <ShiftTable
                dates={dates}
                todayIso={todayIso}
                staffList={staffList}
                assignments={displayAssignments}
                shiftTypes={displayShiftTypes}
                mode="staff"
                currentStaffId={profile.staffId}
                onlyCurrentStaff={onlyMe}
                lang={lang}
                attentionCellKeys={attentionCellKeys}
                onCellClick={(staffId, date) => {
                  if (staffId !== profile.staffId) return;
                  setSelectedDate(date);
                }}
              />
            </div>
            <div style={{ marginTop: 10 }}>
              <ShiftLegend shiftTypes={displayShiftTypes} lang={lang} />
            </div>

            <Modal
              open={selectedDate !== null}
              onClose={() => setSelectedDate(null)}
              title={selectedDate ?? ''}
            >
              {selectedAssignment ? (
                <div style={{ display: 'grid', gap: 0, marginBottom: canRequestExchange ? 12 : 0 }}>
                  {[
                    [
                      t('shiftLabel'),
                      (() => {
                        const st = shiftTypeById.get(selectedAssignment.shiftTypeId ?? '');
                        return st ? shiftTypeDisplayLabel(st) : 'Custom';
                      })(),
                    ],
                    [t('timeLabel'), `${utcIsoToLocalDateTime(selectedAssignment.startsAt, timeZone).localTime} - ${utcIsoToLocalDateTime(selectedAssignment.endsAt, timeZone).localTime}`],
                  ].map(([label, value]) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: `1px solid ${colors.border}` }}>
                      <span style={mutedText}>{label}</span>
                      <strong style={{ color: colors.textPrimary }}>{value}</strong>
                    </div>
                  ))}
                </div>
              ) : selectedAttendance ? (
                <div style={{ display: 'grid', gap: 0 }}>
                  {[
                    [t('clockInLabel'), selectedAttendance.clockIn ? utcIsoToLocalDateTime(selectedAttendance.clockIn, timeZone).localTime : '-'],
                    [t('clockOutLabel'), selectedAttendance.clockOut ? utcIsoToLocalDateTime(selectedAttendance.clockOut, timeZone).localTime : '-'],
                    [t('transportationLabel'), selectedAttendance.transportationCost == null ? '-' : `¥${selectedAttendance.transportationCost}`],
                  ].map(([label, value]) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: `1px solid ${colors.border}` }}>
                      <span style={mutedText}>{label}</span>
                      <strong style={{ color: colors.textPrimary }}>{value}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={mutedText}>{t('noShiftOrReport')}</p>
              )}
              {canRequestExchange && selectedAssignment ? (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${colors.border}` }}>
                  <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 700, color: colors.textPrimary }}>{t('requestChangeHeading')}</p>
                  <ShiftExchangeRequestForm
                    shiftId={selectedAssignment.assignmentId}
                    lang={lang}
                    onSuccess={() => {
                      setSelectedDate(null);
                      handleFormSuccess(t('exchangeSubmitted'));
                    }}
                  />
                </div>
              ) : existingExchangeForSelected ? (
                <p style={{ marginTop: 12, ...mutedText, fontSize: 13 }}>
                  {existingExchangeMessage[lang](existingExchangeForSelected.status)}
                </p>
              ) : null}
            </Modal>
          </>
        )}
      </section>

      <div style={{ marginTop: 16 }}>
        <TransportMessageForm
          workDate={todayIso}
          defaultTransportationCost={todayAttendance?.transportationCost ?? null}
          defaultDailyMessage={todayAttendance?.dailyMessage ?? null}
          lang={lang}
          onSuccess={() => handleFormSuccess(t('workReportSubmitted'))}
        />
      </div>

      <section style={{ ...card, marginTop: 16 }}>
        {shiftTypes === null ? (
          <p style={{ margin: 0, ...mutedText }}>{t('shiftTypesUnavailable')}</p>
        ) : (
          <button type="button" style={{ ...buttonPrimary, width: '100%', justifyContent: 'center' }} onClick={() => setMonthlyModalOpen(true)}>
            {t('preferenceModalTitle')}
          </button>
        )}
      </section>

      {shiftTypes !== null ? (
        <MonthlyShiftPreferenceModal
          open={monthlyModalOpen}
          onClose={() => setMonthlyModalOpen(false)}
          shiftTypes={shiftTypes}
          requests={requests ?? []}
          lang={lang}
          onSuccess={(message) => handleFormSuccess(message)}
        />
      ) : null}
    </>
  );
}
