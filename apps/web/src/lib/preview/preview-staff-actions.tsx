'use client';

import { useState } from 'react';
import type { WorkforceAttendance } from '@/lib/workforce/attendance';
import type { WorkforceShiftType } from '@/lib/workforce/shift-types';
import { Modal } from '@/components/demo/cafe/Modal';
import { buttonPrimary, buttonSecondary, card, mutedText } from '@/lib/demo/cafe/theme';
import { PreviewCorrectionRequestForm } from './preview-correction-request-form';
import { PreviewShiftPreferenceForm } from './preview-shift-preference-form';
import { PreviewWorkReportForm } from './preview-work-report-form';

type StaffDialog = 'preference' | 'report' | 'correction' | null;

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
    <section style={card}>
      <h2 style={{ margin: 0, fontSize: 16 }}>申請・報告</h2>
      <p style={{ margin: '6px 0 14px', ...mutedText, fontSize: 13 }}>
        シフト希望、勤務報告、勤務時間の修正依頼をここから提出できます。
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
        <button type="button" style={buttonPrimary} onClick={() => setDialog('preference')}>
          シフト希望を提出
        </button>
        <button type="button" style={buttonSecondary} onClick={() => setDialog('report')}>
          勤務報告を提出
        </button>
        <button type="button" style={buttonSecondary} onClick={() => setDialog('correction')}>
          修正を依頼
        </button>
      </div>

      <Modal open={dialog === 'preference'} onClose={() => setDialog(null)} title="シフト希望の提出">
        <PreviewShiftPreferenceForm shiftTypes={shiftTypes} defaultWorkDate={defaultPreferenceDate} embedded />
      </Modal>
      <Modal open={dialog === 'report'} onClose={() => setDialog(null)} title="勤務報告の提出">
        <PreviewWorkReportForm defaultWorkDate={defaultReportDate} embedded />
      </Modal>
      <Modal open={dialog === 'correction'} onClose={() => setDialog(null)} title="修正依頼の提出">
        <PreviewCorrectionRequestForm
          attendanceOptions={attendanceOptions}
          defaultWorkDate={defaultPreferenceDate}
          embedded
        />
      </Modal>
    </section>
  );
}
