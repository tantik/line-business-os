'use client';

import { useState, useTransition } from 'react';
import type { WorkforceStaffManageEntry } from '@/lib/workforce/employees';
import type { Lang } from '@/lib/demo/cafe/i18n';
import { ConfirmDialog } from '@/components/shared/design-kit';
import { LoadingButton } from '@/components/ui/loading';
import { alertDanger, badgeStyle, buttonDisabled, buttonSecondary, colors, mutedText } from '@/lib/ui/theme';
import hoverStyles from '@/lib/ui/theme.module.css';
import { setEmployeeAdminRole } from '@/lib/workforce/staff-actions';
import { adminRoleBlockReason, adminRoleErrorCopyKey } from '@/lib/workforce/admin-role';
import { adminRoleSectionCopy, tManagerDashboard } from './manager-dashboard-i18n';

// Same success-alert shape as manager-role-section.tsx / the dashboard banner.
const alertSuccess = {
  border: `1px solid ${colors.success}`,
  background: colors.successMuted,
  color: colors.success,
  borderRadius: 8,
  padding: '8px 12px',
  fontSize: 14,
} as const;

export interface AdminRoleSectionProps {
  staff: WorkforceStaffManageEntry;
  selfStaffId: string | null;
  onChange: () => void;
  lang: Lang;
}

/**
 * 4B-4b (0140): 「管理者にする / 管理者から外す」 inside the staff detail view,
 * mirroring `ManagerRoleSection`. Rendered only for the Owner
 * (`canAppointAdmins`, resolved server-side in page.tsx via `isTenantOwner`);
 * `api.set_employee_admin_role` is the real gate.
 */
export function AdminRoleSection({ staff, selfStaffId, onChange, lang }: AdminRoleSectionProps) {
  const t = (key: Parameters<typeof tManagerDashboard>[1]) => tManagerDashboard(lang, key);
  const sectionCopy = adminRoleSectionCopy[lang];
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const blockReason = adminRoleBlockReason(staff, selfStaffId);
  const nextIsAdmin = !staff.isAdmin;
  const actionLabel = staff.isAdmin ? t('revokeAdmin') : t('appointAdmin');
  const hintId = `admin-role-hint-${staff.staffId}`;

  function handleConfirm() {
    setError(null);
    setSuccess(null);
    const formData = new FormData();
    formData.set('staffId', staff.staffId);
    formData.set('isAdmin', nextIsAdmin ? 'true' : 'false');
    startTransition(async () => {
      const result = await setEmployeeAdminRole(formData);
      setConfirmOpen(false);
      if (result.status === 'success') {
        setSuccess(result.data.isAdmin ? t('adminAppointed') : t('adminRevoked'));
        onChange();
      } else {
        setError(t(adminRoleErrorCopyKey(result.code)));
      }
    });
  }

  return (
    <section>
      <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>{sectionCopy.heading}</h3>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {staff.isAdmin ? (
          <>
            <span style={badgeStyle('gold')}>{t('adminBadge')}</span>
            <span style={{ fontSize: 13, ...mutedText }}>{t('adminRoleIsAdmin')}</span>
          </>
        ) : (
          <span style={{ fontSize: 13, ...mutedText }}>{sectionCopy.isNotAdmin}</span>
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
        title={staff.isAdmin ? t('revokeAdminConfirmTitle') : t('appointAdminConfirmTitle')}
        confirmLabel={actionLabel}
        cancelLabel={t('cancel')}
        pending={isPending}
        danger={staff.isAdmin}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleConfirm}
      >
        <strong style={{ display: 'block', marginBottom: 6 }}>{staff.name}</strong>
        {staff.isAdmin ? t('revokeAdminConfirmBody') : t('appointAdminConfirmBody')}
      </ConfirmDialog>
    </section>
  );
}
