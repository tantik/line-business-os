'use client';

import { useState } from 'react';
import type { WorkforceStaffManageEntry } from '@/lib/workforce/employees';
import type { WorkforceAttendance } from '@/lib/workforce/attendance';
import { estimatedEarningsSummary } from '@/lib/workforce/estimated-earnings';
import { Modal } from '@/components/shared/design-kit';
import { badgeStyle, buttonPrimary, mutedText } from '@/lib/ui/theme';
import type { Lang } from '@/lib/demo/cafe/i18n';
import { tManagerDashboard } from './manager-dashboard-i18n';

export interface StaffNameDetailPopupProps {
  open: boolean;
  onClose: () => void;
  staffEntry: WorkforceStaffManageEntry | null;
  /** Full tenant attendance list -- this component filters to `staffEntry`'s own rows. */
  attendance: WorkforceAttendance[];
  /** Current local month, `YYYY-MM` -- worked hours/earnings are this-month-to-date, matching the plan's "Estimated labour cost" framing (A7), not a full historical report. */
  monthPrefix: string;
  lang: Lang;
}

/**
 * Read-only staff detail popup opened from the Shift-schedule grid's staff
 * name (A6). Numbers come from `estimated-earnings.ts` (the same
 * attendance-based calculation already used elsewhere in this app), not any
 * schedule-based estimate -- deliberately correct per the mission's
 * "estimated labour cost = hours already worked, not the full theoretical
 * week" decision. "Copy monthly report" builds a plain-text summary for
 * pasting elsewhere (chat, spreadsheet); there is no clipboard-formatting
 * logic anywhere else in this codebase to reuse (checked), so this is a new,
 * minimal implementation, not a port.
 */
export function StaffNameDetailPopup({ open, onClose, staffEntry, attendance, monthPrefix, lang }: StaffNameDetailPopupProps) {
  const t = (key: Parameters<typeof tManagerDashboard>[1]) => tManagerDashboard(lang, key);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  const ownAttendance = staffEntry ? attendance.filter((a) => a.employeeId === staffEntry.staffId) : [];
  const summary = estimatedEarningsSummary(ownAttendance, monthPrefix, staffEntry?.hourlyWageYen ?? null);

  function handleCopy() {
    if (!staffEntry) return;
    const lines = [
      `${t('staffNamePopupTitlePrefix')}: ${staffEntry.name}`,
      `${t('staffNamePopupMonth')}: ${monthPrefix}`,
      `${t('staffNamePopupWorkedHours')}: ${summary.workedHours}`,
      `${t('staffNamePopupHourlyWage')}: ${summary.hourlyWageYen ?? '-'}`,
      `${t('staffNamePopupEarnedSoFar')}: ${summary.estimatedEarningsYen ?? '-'}`,
    ];
    const text = lines.join('\n');

    if (!navigator.clipboard?.writeText) {
      setCopyState('failed');
      return;
    }
    navigator.clipboard
      .writeText(text)
      .then(() => setCopyState('copied'))
      .catch(() => setCopyState('failed'));
  }

  return (
    <Modal
      open={open && staffEntry !== null}
      onClose={() => {
        setCopyState('idle');
        onClose();
      }}
      title={staffEntry?.name ?? ''}
      closeLabel={t('cancel')}
      width="min(480px, 94vw)"
    >
      {staffEntry ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={badgeStyle(staffEntry.isActive ? 'active' : 'neutral')}>
              {staffEntry.isActive ? t('statusActive') : t('statusInactive')}
            </span>
            {staffEntry.positionLabel ? <span style={mutedText}>{staffEntry.positionLabel}</span> : null}
          </div>

          <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', rowGap: 8, columnGap: 12, fontSize: 14 }}>
            <dt style={mutedText}>{t('staffNamePopupWorkedHours')}</dt>
            <dd style={{ margin: 0 }}>{summary.workedHours}</dd>
            <dt style={mutedText}>{t('staffNamePopupHourlyWage')}</dt>
            <dd style={{ margin: 0 }}>{summary.hourlyWageYen ?? '-'}</dd>
            <dt style={mutedText}>{t('staffNamePopupEarnedSoFar')}</dt>
            <dd style={{ margin: 0 }}>{summary.estimatedEarningsYen ?? '-'}</dd>
          </dl>

          <div>
            <button type="button" style={buttonPrimary} onClick={handleCopy}>
              {t('staffNamePopupCopyReport')}
            </button>
            {copyState === 'copied' ? (
              <span role="status" style={{ ...mutedText, marginLeft: 10, fontSize: 13 }}>
                {t('staffNamePopupCopied')}
              </span>
            ) : null}
            {copyState === 'failed' ? (
              <span role="alert" style={{ marginLeft: 10, fontSize: 13, color: 'crimson' }}>
                {t('staffNamePopupCopyFailed')}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
