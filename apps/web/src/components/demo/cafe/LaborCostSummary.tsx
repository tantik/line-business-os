'use client';

import { useState } from 'react';
import { Modal } from './Modal';
import { scheduledHoursForStaff } from '@/lib/demo/cafe/data';
import { formatYen } from '@/lib/demo/cafe/format';
import { demoColors } from '@/lib/demo/cafe/theme';
import type { ShiftAssignment, StaffMember } from '@/lib/demo/cafe/types';

interface LaborCostSummaryProps {
  staffList: StaffMember[];
  assignments: ShiftAssignment[];
}

const DISCLAIMER_TEXT =
  'この金額は、勤務記録・時給・交通費をもとにした管理用の概算です。税金、社会保険料、控除、割増賃金などの正式な給与計算は含まれていません。正式な給与計算・給与明細の作成は、貴社の社労士・税理士・給与計算担当者にご確認ください。';

function workedDaysCount(assignments: ShiftAssignment[], staffId: string): number {
  return assignments.filter((a) => a.staffId === staffId && a.shiftTypeId && a.shiftTypeId !== 'dayoff').length;
}

/**
 * Compact total-only labor cost line below the shift table. Deliberately
 * does not show a per-staff breakdown on this screen — see disclaimer for
 * why this is an estimate, not payroll.
 */
export function LaborCostSummary({ staffList, assignments }: LaborCostSummaryProps) {
  const [showDisclaimer, setShowDisclaimer] = useState(false);

  const total = staffList.reduce((sum, staff) => {
    const hours = scheduledHoursForStaff(assignments, staff.id);
    const transportTotal = staff.defaultTransportYen * workedDaysCount(assignments, staff.id);
    return sum + hours * staff.hourlyWageYen + transportTotal;
  }, 0);

  return (
    <div
      style={{
        marginTop: 12,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 8,
        padding: '10px 4px 0',
        fontSize: 14,
      }}
    >
      <span style={{ color: demoColors.textMuted }}>概算人件費合計</span>
      <strong style={{ fontSize: 16 }}>{formatYen(total)}</strong>
      <button
        type="button"
        onClick={() => setShowDisclaimer(true)}
        aria-label="概算についての注記"
        style={{
          width: 20,
          height: 20,
          borderRadius: '50%',
          border: `1px solid ${demoColors.border}`,
          background: demoColors.surfaceElevated,
          color: demoColors.textMuted,
          fontSize: 12,
          cursor: 'pointer',
          lineHeight: 1,
        }}
      >
        i
      </button>

      <Modal open={showDisclaimer} onClose={() => setShowDisclaimer(false)} title="概算についての注記">
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7, color: demoColors.textPrimary }}>{DISCLAIMER_TEXT}</p>
      </Modal>
    </div>
  );
}
