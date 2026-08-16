'use client';

import { Modal } from './Modal';
import { formatMonthDayWeekday, formatHours, formatYen } from '@/lib/demo/cafe/format';
import { buttonPrimary, buttonSecondary, demoColors, shiftTypeDisplayLabel } from '@/lib/demo/cafe/theme';
import type { ShiftAssignment, ShiftTypeDef, WorkReport } from '@/lib/demo/cafe/types';

interface ManagerReportModalProps {
  open: boolean;
  onClose: () => void;
  staffName: string;
  date: string;
  report: WorkReport | null;
  assignment: ShiftAssignment | null | undefined;
  shiftTypes: ShiftTypeDef[];
  isShortageDay: boolean;
  onApproveCorrection: () => void;
  onRejectCorrection: () => void;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${demoColors.border}` }}>
      <span style={{ color: demoColors.textMuted, fontSize: 13 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function CorrectionField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 11.5, color: demoColors.textMuted, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: demoColors.textPrimary }}>{value}</div>
    </div>
  );
}

/**
 * Read-only past-day detail for the manager dashboard — past days are
 * report/view only (shift editing is future-days-only, see
 * `ShiftEditModal`). Shows the actual concrete "!" content (original staff
 * message + a static demo JA translation when one exists, plus any
 * correction request or staffing-shortage note) instead of a generic
 * placeholder.
 */
export function ManagerReportModal({
  open,
  onClose,
  staffName,
  date,
  report,
  assignment,
  shiftTypes,
  isShortageDay,
  onApproveCorrection,
  onRejectCorrection,
}: ManagerReportModalProps) {
  if (!open) return null;

  const shiftType = shiftTypes.find((type) => type.id === assignment?.shiftTypeId);
  const plannedLabel = report?.plannedLabel ?? (shiftType ? shiftTypeDisplayLabel(shiftType) : '－');

  return (
    <Modal open={open} onClose={onClose} title={`${staffName} ${formatMonthDayWeekday(new Date(`${date}T00:00:00`))}`}>
      <Row label="シフト予定" value={plannedLabel} />
      <Row label="出勤" value={report?.actualClockIn ?? '－'} />
      <Row label="休憩" value={report ? `${report.breakMinutes}分` : '－'} />
      <Row label="退勤" value={report?.actualClockOut ?? '－'} />
      <Row label="実働時間" value={report?.actualWorkedHours != null ? formatHours(report.actualWorkedHours) : '－'} />
      <Row label="交通費" value={report ? formatYen(report.transportYen) : '－'} />

      <div style={{ padding: '8px 0' }}>
        <div style={{ color: demoColors.textMuted, fontSize: 13, marginBottom: 4 }}>メッセージ</div>
        {report?.message ? (
          <div style={{ display: 'grid', gap: 8 }}>
            <div>
              <div style={{ fontSize: 11.5, color: demoColors.textMuted, marginBottom: 2 }}>原文</div>
              <div style={{ fontSize: 13 }}>{report.message}</div>
            </div>
            {report.messageTranslated ? (
              <div>
                <div style={{ fontSize: 11.5, color: demoColors.textMuted, marginBottom: 2 }}>自動翻訳（デモ）</div>
                <div style={{ fontSize: 13 }}>{report.messageTranslated}</div>
              </div>
            ) : null}
          </div>
        ) : (
          <div style={{ fontSize: 13 }}>なし</div>
        )}
      </div>

      {report?.hasCorrectionRequest && report.correctionRequest ? (
        <div
          style={{
            marginTop: 12,
            padding: '12px 14px',
            borderRadius: 8,
            background: demoColors.alertDangerBg,
            border: `1px solid ${demoColors.danger}`,
          }}
        >
          <div style={{ fontSize: 13.5, fontWeight: 700, color: demoColors.dangerText }}>勤務時間の修正依頼</div>
          <p style={{ margin: '4px 0 10px', fontSize: 12.5, color: demoColors.textPrimary }}>
            スタッフが勤務時間の修正を依頼しています。
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <CorrectionField label="申請された出勤時間" value={report.correctionRequest.requestedClockIn ?? '－'} />
            <CorrectionField label="申請された退勤時間" value={report.correctionRequest.requestedClockOut ?? '－'} />
            <CorrectionField
              label="申請された休憩時間"
              value={report.correctionRequest.requestedBreakMinutes != null ? `${report.correctionRequest.requestedBreakMinutes}分` : '－'}
            />
          </div>

          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 11.5, color: demoColors.textMuted, marginBottom: 2 }}>理由</div>
            <div
              style={{
                fontSize: 13,
                padding: '8px 10px',
                borderRadius: 6,
                background: demoColors.surface,
                border: `1px solid ${demoColors.border}`,
              }}
            >
              {report.correctionRequest.reason}
            </div>
          </div>

          {report.correctionRequest.status === 'approved' ? (
            <p style={{ margin: '10px 0 0', fontSize: 12.5, fontWeight: 700, color: demoColors.accentStrong }}>承認済み</p>
          ) : report.correctionRequest.status === 'rejected' ? (
            <p style={{ margin: '10px 0 0', fontSize: 12.5, fontWeight: 700, color: demoColors.dangerText }}>却下済み</p>
          ) : (
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button type="button" style={buttonPrimary} onClick={onApproveCorrection}>
                承認する
              </button>
              <button type="button" style={buttonSecondary} onClick={onRejectCorrection}>
                却下する
              </button>
            </div>
          )}
        </div>
      ) : null}

      {isShortageDay ? (
        <div
          style={{
            marginTop: 12,
            padding: '10px 12px',
            borderRadius: 8,
            background: demoColors.alertWarningBg,
            border: `1px solid ${demoColors.warning}`,
            fontSize: 12.5,
            color: demoColors.textPrimary,
            fontWeight: 700,
          }}
        >
          必要人数に対して人員が不足しています
        </div>
      ) : null}
    </Modal>
  );
}
