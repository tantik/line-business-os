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
import { useLang } from '@/lib/demo/cafe/i18n';
import { tStaff } from '@/lib/demo/cafe/i18n.staff';

export interface PreviewStaffActionsProps {
  shiftTypes: WorkforceShiftType[] | null;
  todayAttendance: WorkforceAttendance | null;
  preferenceSubmitted: boolean;
  defaultPreferenceDate: string;
  defaultReportDate: string;
}

/**
 * Founder QA F09: this card used to also render a second, standalone
 * "Request a correction" button (always targeting only the single most
 * recent completed work day, disabled entirely with no completed attendance
 * yet) - fully redundant with the contextual entry point on the Shift
 * Schedule itself (`PreviewStaffSchedule`: tap any day cell -> that day's
 * detail -> "Request a correction", correctly prepopulated for *that* date,
 * not just the latest one). Removed here rather than keeping two paths to
 * the same workflow - see that component for the canonical flow.
 */
export function PreviewStaffActions({ shiftTypes, todayAttendance, preferenceSubmitted, defaultPreferenceDate, defaultReportDate }: PreviewStaffActionsProps) {
  const [preferenceOpen, setPreferenceOpen] = useState(false);
  const { lang } = useLang();
  const t = (key: Parameters<typeof tStaff>[1]) => tStaff(lang, key);
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
      <Modal open={preferenceOpen} onClose={() => setPreferenceOpen(false)} title={t('submitNextMonthPreference')} maxWidth={520}>
        <PreviewShiftPreferenceCalendar shiftTypes={shiftTypes} defaultMonthDate={defaultPreferenceDate} onClose={() => setPreferenceOpen(false)} />
      </Modal>
    </>
  );
}
