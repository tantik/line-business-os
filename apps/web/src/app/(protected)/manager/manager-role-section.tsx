'use client';

import { useState, useTransition } from 'react';
import type { WorkforceStaffManageEntry } from '@/lib/workforce/employees';
import type { Lang } from '@/lib/demo/cafe/i18n';
import { ConfirmDialog } from '@/components/shared/design-kit';
import { LoadingButton } from '@/components/ui/loading';
import { alertDanger, badgeStyle, buttonDisabled, buttonSecondary, colors, mutedText } from '@/lib/ui/theme';
import hoverStyles from '@/lib/ui/theme.module.css';
import { setEmployeeManagerRole } from '@/lib/workforce/staff-actions';
import { managerRoleBlockReason, managerRoleErrorCopyKey } from '@/lib/workforce/manager-role';
import { tManagerDashboard } from './manager-dashboard-i18n';

// Same success-alert shape as manager-dashboard-client.tsx's banner.
const alertSuccess = {
  border: `1px solid ${colors.success}`,
  background: colors.successMuted,
  color: colors.success,
  borderRadius: 8,
  padding: '8px 12px',
  fontSize: 14,
} as const;

export interface ManagerRoleSectionProps {
  staff: WorkforceStaffManageEntry;
  selfStaffId: string | null;
  onChange: () => void;
  lang: Lang;
}

/**
 * 4B-4a (0138, DEBT-091 a): 「店長にする / 店長から外す」 inside the staff
 * detail view. Rendered only for an Owner/Admin (`canAppointManagers`,
 * resolved server-side in page.tsx); `api.set_employee_manager_role` is the
 * real gate. The staff list rows carry no actions by design (2026-08-21
 * redesign), so the action lives here, next to Account access, not in a
 * row ••• menu.
 */
export function ManagerRoleSection({ staff, selfStaffId, onChange, lang }: ManagerRoleSectionProps) {
  const t = (key: Parameters<typeof tManagerDashboard>[1]) => tManagerDashboard(lang, key);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const blockReason = managerRoleBlockReason(staff, selfStaffId);
  const nextIsManager = !staff.isManager;
  const actionLabel = staff.isManager ? t('revokeManager') : t('appointManager');
  const hintId = `manager-role-hint-${staff.staffId}`;

  function handleConfirm() {
    setError(null);
    setSuccess(null);
    const formData = new FormData();
    formData.set('staffId', staff.staffId);
    formData.set('isManager', nextIsManager ? 'true' : 'false');
    startTransition(async () => {
      const result = await setEmployeeManagerRole(formData);
      setConfirmOpen(false);
      if (result.status === 'success') {
        setSuccess(result.data.isManager ? t('managerAppointed') : t('managerRevoked'));
        onChange();
      } else {
        setError(t(managerRoleErrorCopyKey(result.code)));
      }
    });
  }

  return (
    <section>
      <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>{t('managerRoleHeading')}</h3>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {staff.isManager ? (
          <>
            <span style={badgeStyle('info')}>{t('managerBadge')}</span>
            <span style={{ fontSize: 13, ...mutedText }}>{t('managerRoleIsManager')}</span>
          </>
        ) : (
          <span style={{ fontSize: 13, ...mutedText }}>{t('managerRoleIsStaff')}</span>
        )}
      </div>
      {error ? <div role="alert" style={{ ...alertDanger, marginTop: 8 }}>{error}</div> : null}
      {success ? (
        <div role="status" style={{ ...alertSuccess, marginTop: 8 }}>
          {success}
        </div>
      ) : null}
      <div style={{ marginTop: 10 }}>
        {blockReason ? (
          <button type="button" style={buttonDisabled} disabled aria-describedby={hintId}>
            {actionLabel}
          </button>
        ) : (
          <LoadingButton
            type="button"
            pending={isPending}
            pendingLabel={t('saving')}
            style={buttonSecondary}
            pendingStyle={buttonDisabled}
            className={hoverStyles.buttonSecondary}
            onClick={() => setConfirmOpen(true)}
          >
            {actionLabel}
          </LoadingButton>
        )}
        {blockReason ? (
          <p id={hintId} style={{ margin: '6px 0 0', fontSize: 12, ...mutedText }}>
            {t(blockReason)}
          </p>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title={staff.isManager ? t('revokeManagerConfirmTitle') : t('appointManagerConfirmTitle')}
        confirmLabel={actionLabel}
        cancelLabel={t('cancel')}
        pending={isPending}
        danger={staff.isManager}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleConfirm}
      >
        <strong style={{ display: 'block', marginBottom: 6 }}>{staff.name}</strong>
        {staff.isManager ? t('revokeManagerConfirmBody') : t('appointManagerConfirmBody')}
      </ConfirmDialog>
    </section>
  );
}
