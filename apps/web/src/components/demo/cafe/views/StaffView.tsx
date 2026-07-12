'use client';

import { useEffect, useState } from 'react';
import { ClockPanel } from '@/components/demo/cafe/ClockPanel';
import { WeekCarousel } from '@/components/demo/cafe/WeekCarousel';
import { ShiftLegend } from '@/components/demo/cafe/ShiftLegend';
import { WorkReportModal } from '@/components/demo/cafe/WorkReportModal';
import { CorrectionRequestModal } from '@/components/demo/cafe/CorrectionRequestModal';
import type { CorrectionRequestPayload } from '@/components/demo/cafe/CorrectionRequestModal';
import { ShiftPreferenceModal } from '@/components/demo/cafe/ShiftPreferenceModal';
import { BrandMark } from '@/components/demo/cafe/BrandMark';
import { LangToggle } from '@/components/demo/cafe/LangToggle';
import { DemoHelpButton } from '@/components/demo/cafe/DemoHelpButton';
import {
  HELP_STAFF_NEXT_MONTH_PREFERENCE,
  HELP_STAFF_SHIFT_TABLE,
  HELP_STAFF_TRANSPORT_MESSAGE,
} from '@/lib/demo/cafe/helpContent';
import { useLang } from '@/lib/demo/cafe/i18n';
import { tStaff } from '@/lib/demo/cafe/i18n.staff';
import { useTodayIso } from '@/lib/demo/cafe/useTodayIso';
import { CURRENT_STAFF_DEMO_WORKED_HOURS, CURRENT_STAFF_ID, SHIFT_TYPES, STAFF } from '@/lib/demo/cafe/data';
import { formatYen } from '@/lib/demo/cafe/format';
import { buttonPrimary, buttonSecondary, card, demoColors, input, mobilePageStyle, mutedText } from '@/lib/demo/cafe/theme';
import type { WorkReport } from '@/lib/demo/cafe/types';
import { useBrand } from '@/lib/demo/brand';
import { saveTodayMessage, scopeForBrandSlug, submitCorrectionRequest, useDemoCafeStore } from '@/lib/demo/cafe/store';

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
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <BrandMark />
          <div style={{ minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: 20 }}>{lang === 'ja' ? brand.nameJa : brand.name}</h1>
            <p style={{ margin: '2px 0 0', fontSize: 15, fontWeight: 700, color: demoColors.textPrimary }}>
              {currentStaff.name}
              {lang === 'ja' ? ' さん' : ''}
            </p>
          </div>
        </div>
        <LangToggle />
      </header>

      <div style={{ marginTop: 16 }}>
        <ClockPanel />
      </div>

      <section style={{ ...card, padding: '14px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, padding: '0 8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <strong style={{ fontSize: 15 }}>{t('shiftTable')}</strong>
            <DemoHelpButton content={HELP_STAFF_SHIFT_TABLE} />
          </div>
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
        </div>

        <div style={{ marginTop: 12, padding: '0 4px' }}>
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
        </div>

        <div style={{ marginTop: 12, padding: '0 8px' }}>
          <ShiftLegend shiftTypes={SHIFT_TYPES} lang={lang} />
        </div>

        <p style={{ margin: '12px 8px 0', fontSize: 14, fontWeight: 700 }}>
          {t('workedHours')}: {CURRENT_STAFF_DEMO_WORKED_HOURS.toFixed(1)}h
        </p>
      </section>

      <section style={{ ...card }}>
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
      </section>

      <section style={{ ...card }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button type="button" style={{ ...buttonPrimary, flex: 1 }} onClick={() => setPreferenceModalOpen(true)}>
            {t('submitNextMonthPreference')}
            {preferenceSubmitted ? t('submittedSuffix') : ''}
          </button>
          <DemoHelpButton content={HELP_STAFF_NEXT_MONTH_PREFERENCE} />
        </div>
      </section>

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
