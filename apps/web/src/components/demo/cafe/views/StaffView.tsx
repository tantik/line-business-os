'use client';

import { useEffect, useState } from 'react';
import { ClockPanel } from '@/components/demo/cafe/ClockPanel';
import { ClockOutModal, type DemoClockOutBreakMinutes } from '@/components/demo/cafe/ClockOutModal';
import { WeekCarousel } from '@/components/demo/cafe/WeekCarousel';
import { ShiftLegend } from '@/components/demo/cafe/ShiftLegend';
import { WorkReportModal } from '@/components/demo/cafe/WorkReportModal';
import { CorrectionRequestModal } from '@/components/demo/cafe/CorrectionRequestModal';
import type { CorrectionRequestPayload } from '@/components/demo/cafe/CorrectionRequestModal';
import { ShiftPreferenceModal } from '@/components/demo/cafe/ShiftPreferenceModal';
import { BrandMark } from '@/components/demo/cafe/BrandMark';
import { LangToggle } from '@/components/demo/cafe/LangToggle';
import { DemoHelpButton } from '@/components/demo/cafe/DemoHelpButton';
import { DemoResetButton } from '@/components/demo/cafe/DemoResetButton';
import {
  CafeStaffHeader,
  CafeStaffPreferenceCard,
  CafeStaffReportCard,
  CafeStaffScheduleCard,
} from '@/components/demo/cafe/CafeStaffPresentation';
import {
  HELP_STAFF_NEXT_MONTH_PREFERENCE,
  HELP_STAFF_SHIFT_TABLE,
  HELP_STAFF_TRANSPORT_MESSAGE,
} from '@/lib/demo/cafe/helpContent';
import { useLang } from '@/lib/demo/cafe/i18n';
import { tStaff } from '@/lib/demo/cafe/i18n.staff';
import { useTodayIso } from '@/lib/demo/cafe/useTodayIso';
import { CURRENT_STAFF_DEMO_WORKED_HOURS, CURRENT_STAFF_ID, SHIFT_TYPES, STAFF } from '@/lib/demo/cafe/data';
import { formatClockLabel, formatYen } from '@/lib/demo/cafe/format';
import { buttonPrimary, buttonSecondary, demoColors, input, mobilePageStyle, mutedText } from '@/lib/demo/cafe/theme';
import type { WorkReport } from '@/lib/demo/cafe/types';
import { useBrand } from '@/lib/demo/brand';
import {
  recordClockEvent,
  saveTodayMessage,
  scopeForBrandSlug,
  submitCorrectionRequest,
  useDemoCafeStore,
} from '@/lib/demo/cafe/store';

const TRANSPORT_STORAGE_KEY = 'demo-cafe-transport-yen';

function segmentedButtonStyle(active: boolean) {
  return {
    padding: '6px 14px',
    fontSize: 12,
    fontWeight: 700,
    border: 'none',
    cursor: 'pointer',
    background: active ? demoColors.accent : 'transparent',
    color: active ? '#FFFFFF' : demoColors.textMuted,
  } as const;
}

function emptyCorrectionDefaults(todayIso: string): CorrectionRequestPayload {
  return { date: todayIso, actualClockIn: '', actualClockOut: '', breakMinutes: 45, message: '' };
}

/** Staff schedule / clock in-out / work-report screen. Shared by `/demo/cafe/staff` and `/mame-to-cha/staff`. */
export function StaffView() {
  const brand = useBrand();
  const { lang } = useLang();
  const t = (key: Parameters<typeof tStaff>[1]) => tStaff(lang, key);

  const todayIso = useTodayIso();
  const currentStaff = STAFF.find((staff) => staff.id === CURRENT_STAFF_ID)!;

  const scope = scopeForBrandSlug(brand.slug);
  const demoStore = useDemoCafeStore(scope);
  const workReports = demoStore.workReports;

  const [onlyMe, setOnlyMe] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);
  const [transportYen, setTransportYen] = useState(currentStaff.defaultTransportYen);
  const [todayMessage, setTodayMessage] = useState('');
  const [messageSaved, setMessageSaved] = useState(false);
  const [selectedReportDate, setSelectedReportDate] = useState<string | null>(null);
  const [preferenceModalOpen, setPreferenceModalOpen] = useState(false);
  const [preferenceSubmitted, setPreferenceSubmitted] = useState(currentStaff.submittedPreference);
  const [correctionModalOpen, setCorrectionModalOpen] = useState(false);
  const [correctionDefaults, setCorrectionDefaults] = useState<CorrectionRequestPayload>(
    emptyCorrectionDefaults(todayIso ?? ''),
  );
  const [clockOutModalOpen, setClockOutModalOpen] = useState(false);
  const [pendingClockOutTime, setPendingClockOutTime] = useState('');

  useEffect(() => {
    if (!todayIso) return;
    const existing = workReports.find((report) => report.date === todayIso && report.staffId === CURRENT_STAFF_ID);
    if (existing) {
      setTodayMessage(existing.message);
      setMessageSaved(existing.message.length > 0);
    }
    // Only prefill once per day change (workReports intentionally excluded) — user typing shouldn't be clobbered by their own save round-tripping through the store.
  }, [todayIso]);

  useEffect(() => {
    const stored = window.localStorage.getItem(TRANSPORT_STORAGE_KEY);
    if (stored) setTransportYen(Number(stored));
  }, []);

  function handleTransportChange(value: number) {
    setTransportYen(value);
    window.localStorage.setItem(TRANSPORT_STORAGE_KEY, String(value));
  }

  function handleSaveMessage() {
    if (!todayIso) return;
    saveTodayMessage(CURRENT_STAFF_ID, todayIso, todayMessage, scope);
    setMessageSaved(true);
  }

  function openCorrectionForm(report: WorkReport | null) {
    setSelectedReportDate(null);
    setCorrectionDefaults(
      report
        ? {
            date: report.date,
            actualClockIn: report.actualClockIn ?? '',
            actualClockOut: report.actualClockOut ?? '',
            breakMinutes: report.breakMinutes,
            message: '',
          }
        : emptyCorrectionDefaults(todayIso ?? ''),
    );
    setCorrectionModalOpen(true);
  }

  function handleCorrectionSubmit(payload: CorrectionRequestPayload) {
    submitCorrectionRequest(CURRENT_STAFF_ID, payload, scope);
  }

  const todayReport = todayIso
    ? workReports.find((report) => report.date === todayIso && report.staffId === CURRENT_STAFF_ID)
    : undefined;
  const clockState = todayReport?.clockState ?? 'idle';
  const clockInLabel = todayReport?.actualClockIn ?? null;

  function handleClockIn() {
    if (!todayIso) return;
    recordClockEvent(CURRENT_STAFF_ID, todayIso, { clockState: 'clocked_in', actualClockIn: formatClockLabel(new Date()) }, scope);
  }

  function requestClockOut() {
    setPendingClockOutTime(formatClockLabel(new Date()));
    setClockOutModalOpen(true);
  }

  function confirmClockOut(breakMinutes: DemoClockOutBreakMinutes) {
    if (!todayIso) return;
    recordClockEvent(
      CURRENT_STAFF_ID,
      todayIso,
      { clockState: 'clocked_out', actualClockOut: pendingClockOutTime, breakMinutes },
      scope,
    );
    setClockOutModalOpen(false);
  }

  if (!todayIso) {
    return (
      <main style={mobilePageStyle(720)}>
        <p style={mutedText}>{t('loading')}</p>
      </main>
    );
  }

  const selectedReport =
    workReports.find((report) => report.date === selectedReportDate && report.staffId === CURRENT_STAFF_ID) ?? null;

  return (
    <main style={mobilePageStyle(720)}>
      <CafeStaffHeader
        mark={<BrandMark />}
        title={
          <>
              {lang === 'ja' ? brand.nameJa : brand.name}
              <span style={{ fontSize: 12, fontWeight: 500, color: demoColors.textMuted }}>{t('demoEnvironmentSuffix')}</span>
          </>
        }
        subtitle={
          <>
            {currentStaff.name}
            {lang === 'ja' ? ' さん' : ''}
          </>
        }
        actions={
          <>
          <DemoResetButton
            scope={scope}
            label={t('resetDemo')}
            doneLabel={t('resetDemoDone')}
            confirmTitle={t('resetConfirmTitle')}
            confirmBody={t('resetConfirmBody')}
            confirmLabel={t('resetConfirmButton')}
            cancelLabel={t('resetCancelButton')}
          />
          <LangToggle />
          </>
        }
      />

      <div style={{ marginTop: 16 }}>
        <ClockPanel
          state={clockState}
          clockInLabel={clockInLabel}
          onClockIn={handleClockIn}
          onClockOutRequest={requestClockOut}
        />
      </div>

      <ClockOutModal
        open={clockOutModalOpen}
        clockOutTime={pendingClockOutTime}
        onClose={() => setClockOutModalOpen(false)}
        onConfirm={confirmClockOut}
      />

      <CafeStaffScheduleCard
        title={
          <>
            {t('shiftTable')}
            <DemoHelpButton content={HELP_STAFF_SHIFT_TABLE} />
          </>
        }
        headerActions={
          <div style={{ display: 'inline-flex', border: `1px solid ${demoColors.border}`, borderRadius: 999, overflow: 'hidden' }}>
            {[
              { key: false, label: t('all') },
              { key: true, label: t('onlyMe') },
            ].map((option) => (
              <button
                key={String(option.key)}
                type="button"
                onClick={() => setOnlyMe(option.key)}
                style={segmentedButtonStyle(onlyMe === option.key)}
              >
                {option.label}
              </button>
            ))}
          </div>
        }
        schedule={
          <WeekCarousel
            weekOffset={weekOffset}
            onWeekOffsetChange={setWeekOffset}
            todayIso={todayIso}
            staffList={STAFF}
            shiftTypes={SHIFT_TYPES}
            currentStaffId={CURRENT_STAFF_ID}
            onlyCurrentStaff={onlyMe}
            workReports={workReports}
            assignments={demoStore.assignmentsPublished}
            onCellClick={(_staffId, date) => setSelectedReportDate(date)}
            lang={lang}
          />
        }
        legend={<ShiftLegend shiftTypes={SHIFT_TYPES} lang={lang} />}
        hoursLabel={`${t('workedHours')}: ${CURRENT_STAFF_DEMO_WORKED_HOURS.toFixed(1)}h`}
      />

      <CafeStaffReportCard>
        <div style={{ marginTop: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <label style={{ fontSize: 13, ...mutedText }}>{t('transport')}</label>
            <DemoHelpButton content={HELP_STAFF_TRANSPORT_MESSAGE} />
          </div>
          <input
            type="number"
            value={transportYen}
            min={0}
            step={10}
            onChange={(event) => handleTransportChange(Number(event.target.value))}
            style={input}
          />
          <p style={{ margin: '4px 0 0', fontSize: 12, ...mutedText }}>
            {formatYen(transportYen)}
            {t('transportRemembered')}
          </p>
        </div>

        <div style={{ marginTop: 14 }}>
          <label style={{ fontSize: 13, ...mutedText }}>{t('todaysMessage')}</label>
          <textarea
            value={todayMessage}
            onChange={(event) => {
              setTodayMessage(event.target.value);
              setMessageSaved(false);
            }}
            rows={2}
            placeholder={t('messagePlaceholder')}
            style={{ ...input, resize: 'vertical' }}
          />
          <button type="button" style={{ ...buttonSecondary, marginTop: 8 }} onClick={handleSaveMessage}>
            {messageSaved ? t('saved') : t('save')}
          </button>
        </div>
      </CafeStaffReportCard>

      <CafeStaffPreferenceCard>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button type="button" style={{ ...buttonPrimary, flex: 1 }} onClick={() => setPreferenceModalOpen(true)}>
            {t('submitNextMonthPreference')}
            {preferenceSubmitted ? t('submittedSuffix') : ''}
          </button>
          <DemoHelpButton content={HELP_STAFF_NEXT_MONTH_PREFERENCE} />
        </div>
      </CafeStaffPreferenceCard>

      <WorkReportModal
        open={selectedReportDate !== null}
        onClose={() => setSelectedReportDate(null)}
        report={selectedReport}
        onOpenCorrectionForm={openCorrectionForm}
      />

      <CorrectionRequestModal
        open={correctionModalOpen}
        onClose={() => setCorrectionModalOpen(false)}
        defaultValues={correctionDefaults}
        onSubmit={handleCorrectionSubmit}
      />

      <ShiftPreferenceModal
        open={preferenceModalOpen}
        onClose={() => setPreferenceModalOpen(false)}
        alreadySubmitted={preferenceSubmitted}
        onSubmit={() => {
          setPreferenceSubmitted(true);
        }}
      />
    </main>
  );
}
