'use client';

import { useState } from 'react';
import type { WorkforceAttendance } from '@/lib/workforce/attendance';
import type { WorkforceShiftType } from '@/lib/workforce/shift-types';
import { DemoHelpButton } from '@/components/demo/cafe/DemoHelpButton';
import { Modal } from '@/components/demo/cafe/Modal';
import { CafeStaffPreferenceCard, CafeStaffReportCard } from '@/components/demo/cafe/CafeStaffPresentation';
import { HELP_STAFF_NEXT_MONTH_PREFERENCE } from '@/lib/demo/cafe/helpContent';
import { buttonPrimary } from '@/lib/demo/cafe/theme';
import { PreviewShiftPreferenceCalendar } from './preview-shift-preference-calendar';
import { PreviewWorkReportForm } from './preview-work-report-form';
import { PreviewCorrectionRequestForm } from './preview-correction-request-form';
import { useLang } from '@/lib/demo/cafe/i18n';
import { tStaff } from '@/lib/demo/cafe/i18n.staff';

export interface PreviewStaffActionsProps {
  shiftTypes: WorkforceShiftType[] | null;
  attendanceOptions: WorkforceAttendance[] | null;
  todayAttendance: WorkforceAttendance | null;
  preferenceSubmitted: boolean;
  defaultPreferenceDate: string;
  defaultReportDate: string;
  timeZone: string;
}

export function PreviewStaffActions({ shiftTypes, attendanceOptions, todayAttendance, preferenceSubmitted, defaultPreferenceDate, defaultReportDate, timeZone }: PreviewStaffActionsProps) {
  const [preferenceOpen, setPreferenceOpen] = useState(false);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const { lang } = useLang();
  const t = (key: Parameters<typeof tStaff>[1]) => tStaff(lang, key);
  const completedAttendance = (attendanceOptions ?? []).filter((entry) => Boolean(entry.clockOut));
  const latestCompletedAttendance = completedAttendance.length
    ? completedAttendance.reduce((latest, entry) => (entry.workDate > latest.workDate ? entry : latest))
    : null;
  return (
    <>
      <CafeStaffReportCard>
        <PreviewWorkReportForm defaultWorkDate={defaultReportDate} defaultTransportationCost={todayAttendance?.transportationCost} defaultDailyMessage={todayAttendance?.dailyMessage} embedded hideWorkDate />
      </CafeStaffReportCard>
      <CafeStaffPreferenceCard>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button type="button" style={{ ...buttonPrimary, flex: 1 }} onClick={() => setPreferenceOpen(true)}>
            {t('submitNextMonthPreference')}{preferenceSubmitted ? t('submittedSuffix') : ''}
          </button>
          <DemoHelpButton content={HELP_STAFF_NEXT_MONTH_PREFERENCE} />
        </div>
      </CafeStaffPreferenceCard>
      <CafeStaffPreferenceCard>
        <button
          type="button"
          style={{ ...buttonPrimary, width: '100%' }}
          disabled={!latestCompletedAttendance}
          onClick={() => setCorrectionOpen(true)}
        >
          {t('requestCorrection')}
        </button>
      </CafeStaffPreferenceCard>
      <Modal open={preferenceOpen} onClose={() => setPreferenceOpen(false)} title={t('submitNextMonthPreference')} maxWidth={520}>
        <PreviewShiftPreferenceCalendar shiftTypes={shiftTypes} defaultMonthDate={defaultPreferenceDate} onClose={() => setPreferenceOpen(false)} />
      </Modal>
      <Modal open={correctionOpen} onClose={() => setCorrectionOpen(false)} title={t('correctionModalTitle')}>
        {latestCompletedAttendance ? (
          <PreviewCorrectionRequestForm
            defaultWorkDate={latestCompletedAttendance.workDate}
            defaultAttendance={latestCompletedAttendance}
            timeZone={timeZone}
            embedded
            onSuccess={() => setCorrectionOpen(false)}
          />
        ) : null}
      </Modal>
    </>
  );
}
