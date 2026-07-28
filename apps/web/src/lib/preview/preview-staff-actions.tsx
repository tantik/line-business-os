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

export interface PreviewStaffActionsProps {
  shiftTypes: WorkforceShiftType[] | null;
  attendanceOptions: WorkforceAttendance[] | null;
  todayAttendance: WorkforceAttendance | null;
  preferenceSubmitted: boolean;
  defaultPreferenceDate: string;
  defaultReportDate: string;
}

export function PreviewStaffActions({ shiftTypes, todayAttendance, preferenceSubmitted, defaultPreferenceDate, defaultReportDate }: PreviewStaffActionsProps) {
  const [preferenceOpen, setPreferenceOpen] = useState(false);
  return (
    <>
      <CafeStaffReportCard>
        <PreviewWorkReportForm defaultWorkDate={defaultReportDate} defaultTransportationCost={todayAttendance?.transportationCost} defaultDailyMessage={todayAttendance?.dailyMessage} embedded hideWorkDate />
      </CafeStaffReportCard>
      <CafeStaffPreferenceCard>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button type="button" style={{ ...buttonPrimary, flex: 1 }} onClick={() => setPreferenceOpen(true)}>
            来月のシフト希望を提出{preferenceSubmitted ? '済み' : ''}
          </button>
          <DemoHelpButton content={HELP_STAFF_NEXT_MONTH_PREFERENCE} />
        </div>
      </CafeStaffPreferenceCard>
      <Modal open={preferenceOpen} onClose={() => setPreferenceOpen(false)} title="来月のシフト希望を提出" maxWidth={520}>
        <PreviewShiftPreferenceCalendar shiftTypes={shiftTypes} defaultMonthDate={defaultPreferenceDate} onClose={() => setPreferenceOpen(false)} />
      </Modal>
    </>
  );
}
