'use client';

import { useMemo, useState } from 'react';
import { Modal } from './Modal';
import {
  autoScheduleFutureAssignments,
  buildMonthDateRange,
  generateAssignments,
  generateWorkReports,
  scheduledHoursForStaff,
} from '@/lib/demo/cafe/data';
import { formatHours, formatYen } from '@/lib/demo/cafe/format';
import { buttonSecondary, demoColors, tableCell, tableHeaderCell } from '@/lib/demo/cafe/theme';
import type { StaffMember, StaffRole } from '@/lib/demo/cafe/types';

interface MonthlyReportModalProps {
  open: boolean;
  onClose: () => void;
  staffList: StaffMember[];
  todayIso: string;
}

const DISCLAIMER_TEXT =
  'この金額は、勤務記録・時給・交通費をもとにした管理用の概算です。税金、社会保険料、控除、割増賃金などの正式な給与計算は含まれていません。正式な給与計算・給与明細の作成は、貴社の社労士・税理士・給与計算担当者にご確認ください。';

interface StaffMonthlyRow {
  staff: StaffMember;
  hours: number;
  transportYen: number;
  payYen: number;
}

/**
 * The underlying per-day shift lengths (8h "1/2/3" shifts, 14h manager "通し"
 * shift) model every staff member as working near-daily across the whole
 * month, which sums to an implausible ~220-380h raw total — not credible for
 * a cafe. This demo-only band compresses that raw total into a believable
 * monthly-hours range per role instead (see
 * docs/phase-1j-2-cafe-workforce-demo-to-production-plan.md).
 */
const MONTHLY_HOURS_BAND: Record<StaffRole, { min: number; max: number; scale: number }> = {
  manager: { min: 130, max: 170, scale: 0.4 },
  staff: { min: 60, max: 135, scale: 0.42 },
};

function demoCredibleMonthlyHours(rawHours: number, role: StaffRole): number {
  const band = MONTHLY_HOURS_BAND[role];
  const clamped = Math.min(band.max, Math.max(band.min, rawHours * band.scale));
  return Math.round(clamped * 10) / 10;
}

/** 月間レポート: demo-only, month-scoped per-staff summary. Falls back to scheduled hours where an actual work report is missing (see docs/phase-1j-2 plan). */
function buildMonthlyRows(staffList: StaffMember[], todayIso: string): StaffMonthlyRow[] {
  const monthDates = buildMonthDateRange(new Date(`${todayIso}T00:00:00`));
  const baseAssignments = generateAssignments(monthDates, todayIso);
  const assignments = autoScheduleFutureAssignments(baseAssignments, monthDates, todayIso);
  const workReports = generateWorkReports(monthDates, assignments, todayIso);

  return staffList.map((staff) => {
    const staffReports = workReports.filter((report) => report.staffId === staff.id);
    const reportedDatesWithHours = new Set(
      staffReports.filter((report) => report.actualWorkedHours != null).map((report) => report.date),
    );
    const reportHours = staffReports.reduce((sum, report) => sum + (report.actualWorkedHours ?? 0), 0);
    const fallbackAssignments = assignments.filter(
      (assignment) => assignment.staffId === staff.id && !reportedDatesWithHours.has(assignment.date),
    );
    const fallbackHours = scheduledHoursForStaff(fallbackAssignments, staff.id);
    const hours = demoCredibleMonthlyHours(reportHours + fallbackHours, staff.role);

    const workedDays = assignments.filter(
      (assignment) => assignment.staffId === staff.id && assignment.shiftTypeId && assignment.shiftTypeId !== 'dayoff',
    ).length;
    const transportYen = staff.defaultTransportYen * workedDays;
    const payYen = hours * staff.hourlyWageYen + transportYen;

    return { staff, hours, transportYen, payYen };
  });
}

export function MonthlyReportModal({ open, onClose, staffList, todayIso }: MonthlyReportModalProps) {
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [csvConfirmed, setCsvConfirmed] = useState(false);

  const rows = useMemo(() => (open ? buildMonthlyRows(staffList, todayIso) : []), [open, staffList, todayIso]);
  const totalPayYen = rows.reduce((sum, row) => sum + row.payYen, 0);

  const monthLabel = `${new Date(`${todayIso}T00:00:00`).getMonth() + 1}月`;

  return (
    <>
    <Modal
      open={open}
      onClose={() => {
        setCsvConfirmed(false);
        onClose();
      }}
      title="月間レポート"
      maxWidth={640}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
        <p style={{ margin: 0, fontSize: 12.5, color: demoColors.textMuted }}>{monthLabel}分の概算・スタッフ別サマリー（デモ）</p>
        <button
          type="button"
          onClick={() => setShowDisclaimer(true)}
          aria-label="概算についての注記"
          style={{
            width: 20,
            height: 20,
            flexShrink: 0,
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
      </div>

      <div style={{ overflowX: 'auto', borderRadius: 8, border: `1px solid ${demoColors.border}` }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={tableHeaderCell}>スタッフ</th>
              <th style={{ ...tableHeaderCell, textAlign: 'right' }}>実働時間</th>
              <th style={{ ...tableHeaderCell, textAlign: 'right' }}>時給</th>
              <th style={{ ...tableHeaderCell, textAlign: 'right' }}>交通費</th>
              <th style={{ ...tableHeaderCell, textAlign: 'right' }}>概算支給額</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ staff, hours, transportYen, payYen }) => (
              <tr key={staff.id}>
                <td style={tableCell}>{staff.name}</td>
                <td style={{ ...tableCell, textAlign: 'right' }}>{formatHours(hours)}</td>
                <td style={{ ...tableCell, textAlign: 'right' }}>{formatYen(staff.hourlyWageYen)}</td>
                <td style={{ ...tableCell, textAlign: 'right' }}>{formatYen(transportYen)}</td>
                <td style={{ ...tableCell, textAlign: 'right', fontWeight: 700 }}>{formatYen(payYen)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td style={{ ...tableCell, fontWeight: 700, borderBottom: 'none' }} colSpan={4}>
                合計
              </td>
              <td style={{ ...tableCell, textAlign: 'right', fontWeight: 700, borderBottom: 'none' }}>{formatYen(totalPayYen)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button type="button" style={buttonSecondary} onClick={() => setCsvConfirmed(true)}>
          CSVダウンロード（デモ）
        </button>
        {csvConfirmed ? (
          <span style={{ fontSize: 12.5, color: demoColors.accentStrong, fontWeight: 700 }}>
            ダウンロードしました（デモ・実際のファイルは生成されません）
          </span>
        ) : null}
      </div>
    </Modal>

    <Modal open={showDisclaimer} onClose={() => setShowDisclaimer(false)} title="概算についての注記">
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7, color: demoColors.textPrimary }}>{DISCLAIMER_TEXT}</p>
    </Modal>
    </>
  );
}
