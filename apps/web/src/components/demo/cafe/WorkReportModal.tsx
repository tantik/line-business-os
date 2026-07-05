'use client';

import { Modal } from './Modal';
import { formatMonthDayWeekday, formatHours, formatYen } from '@/lib/demo/cafe/format';
import { buttonPrimary, buttonSecondary, demoColors } from '@/lib/demo/cafe/theme';
import type { WorkReport } from '@/lib/demo/cafe/types';
import { useLang } from '@/lib/demo/cafe/i18n';
import { tStaff } from '@/lib/demo/cafe/i18n.staff';

interface WorkReportModalProps {
  open: boolean;
  onClose: () => void;
  report: WorkReport | null;
  onOpenCorrectionForm: (report: WorkReport) => void;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${demoColors.border}` }}>
      <span style={{ color: demoColors.textMuted, fontSize: 13 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600 }}>{value}</span>
    </div>
  );
}

export function WorkReportModal({ open, onClose, report, onOpenCorrectionForm }: WorkReportModalProps) {
  const { lang } = useLang();
  const t = (key: Parameters<typeof tStaff>[1]) => tStaff(lang, key);

  if (!report) return null;

  return (
    <Modal open={open} onClose={onClose} title={`${t('workReportTitle')} ${formatMonthDayWeekday(new Date(`${report.date}T00:00:00`))}`}>
      <Row label={t('plannedShift')} value={report.plannedLabel} />
      <Row label={t('reportClockIn')} value={report.actualClockIn ?? t('dash')} />
      <Row label={t('breakMinutesLabel')} value={`${report.breakMinutes}${t('minutesSuffix')}`} />
      <Row label={t('reportClockOut')} value={report.actualClockOut ?? t('dash')} />
      <Row label={t('workedHours')} value={report.actualWorkedHours != null ? formatHours(report.actualWorkedHours) : t('dash')} />
      <Row label={t('transport')} value={formatYen(report.transportYen)} />
      <div style={{ padding: '8px 0' }}>
        <div style={{ color: demoColors.textMuted, fontSize: 13, marginBottom: 4 }}>{t('message')}</div>
        <div style={{ fontSize: 13 }}>{report.message || t('none')}</div>
      </div>

      <div style={{ marginTop: 16 }}>
        {report.hasCorrectionRequest ? (
          <span style={{ ...buttonSecondary, display: 'inline-block', cursor: 'default', opacity: 0.8 }}>
            {t('correctionRequested')}
          </span>
        ) : (
          <button type="button" style={buttonPrimary} onClick={() => onOpenCorrectionForm(report)}>
            {t('requestCorrection')}
          </button>
        )}
      </div>
    </Modal>
  );
}
