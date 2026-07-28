'use client';

import { useState } from 'react';
import type { WorkforceAttendance } from '@/lib/workforce/attendance';
import type { WorkforceShiftType } from '@/lib/workforce/shift-types';
import { Modal } from '@/components/demo/cafe/Modal';
import {
  CafeStaffPreferenceCard,
  CafeStaffReportCard,
} from '@/components/demo/cafe/CafeStaffPresentation';
import { buttonPrimary, buttonSecondary } from '@/lib/demo/cafe/theme';
import { PreviewCorrectionRequestForm } from './preview-correction-request-form';
import { PreviewShiftPreferenceForm } from './preview-shift-preference-form';
import { PreviewWorkReportForm } from './preview-work-report-form';

type StaffDialog = 'preference' | 'correction' | null;

export interface PreviewStaffActionsProps {
  shiftTypes: WorkforceShiftType[] | null;
  attendanceOptions: WorkforceAttendance[] | null;
  defaultPreferenceDate: string;
  defaultReportDate: string;
}

/** Product-facing action launcher. Server-owned Preview forms stay isolated inside dialogs. */
export function PreviewStaffActions({
  shiftTypes,
  attendanceOptions,
  defaultPreferenceDate,
  defaultReportDate,
}: PreviewStaffActionsProps) {
  const [dialog, setDialog] = useState<StaffDialog>(null);

  return (
    <>
      <CafeStaffReportCard>
        <PreviewWorkReportForm defaultWorkDate={defaultReportDate} embedded hideWorkDate />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
        <button type="button" style={buttonSecondary} onClick={() => setDialog('correction')}>
          修正を依頼
        </button>
        </div>
      </CafeStaffReportCard>

      <CafeStaffPreferenceCard>
        <button type="button" style={{ ...buttonPrimary, width: '100%' }} onClick={() => setDialog('preference')}>
          来月のシフト希望を提出
        </button>
      </CafeStaffPreferenceCard>

      <Modal open={dialog === 'preference'} onClose={() => setDialog(null)} title="シフト希望の提出">
        <PreviewShiftPreferenceForm shiftTypes={shiftTypes} defaultWorkDate={defaultPreferenceDate} embedded />
      </Modal>
      <Modal open={dialog === 'correction'} onClose={() => setDialog(null)} title="修正依頼の提出">
        <PreviewCorrectionRequestForm
          attendanceOptions={attendanceOptions}
          defaultWorkDate={defaultPreferenceDate}
          embedded
        />
      </Modal>
    </>
  );
}
