'use client';

import { useId, useState, useTransition } from 'react';
import type { WorkforceStaffManageEntry } from '@/lib/workforce/employees';
import type { Lang } from '@/lib/demo/cafe/i18n';
import { ConfirmDialog } from '@/components/shared/design-kit';
import { LoadingButton } from '@/components/ui/loading';
import { alertDanger, badgeStyle, buttonDisabled, buttonSecondary, checkboxInput, checkboxLabel, colors, mutedText } from '@/lib/ui/theme';
import hoverStyles from '@/lib/ui/theme.module.css';
import { setEmployeeManagerRole } from '@/lib/workforce/staff-actions';
import {
  defaultManagerScope,
  managerRoleBlockReason,
  managerRoleErrorCopyKey,
  managerScopeChoiceAvailable,
  type ManagerScope,
} from '@/lib/workforce/manager-role';
import { tManagerDashboard } from './manager-dashboard-i18n';
import { managerScopeCopy } from './stores-i18n';

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
  /** Open stores of this workspace (DEBT-139 L3): with two or more, appointing offers 「この店舗のみ / 全店舗」. */
  activeLocationCount: number;
  onChange: () => void;
  lang: Lang;
}

/** The change the confirm dialog is about to send. */
type PendingChange = { isManager: boolean; scope: ManagerScope; kind: 'appoint' | 'revoke' | 'scope' };

/**
 * 4B-4a (0138, DEBT-091 a): 「店長にする / 店長から外す」 inside the staff
 * detail view. Rendered only for an Owner/Admin (`canAppointManagers`,
 * resolved server-side in page.tsx); `api.set_employee_manager_role` is the
 * real gate. The staff list rows carry no actions by design (2026-08-21
 * redesign), so the action lives here, next to Account access, not in a
 * row ••• menu.
 *
 * DEBT-139 L3 (b, c): always the 4-argument RPC with a scope. One open store
 * -> 'tenant' and the UI is unchanged; two or more -> a 「この店舗のみ」
 * (default) / 「全店舗」 choice on appoint, and for a Manager the current
 * scope plus a secondary "change scope" action (appoint again with the other
 * scope; the RPC replaces the assignment).
 */
export function ManagerRoleSection({ staff, selfStaffId, activeLocationCount, onChange, lang }: ManagerRoleSectionProps) {
  const t = (key: Parameters<typeof tManagerDashboard>[1]) => tManagerDashboard(lang, key);
  const scopeCopy = managerScopeCopy[lang];
  const radioName = useId();
  const [pendingChange, setPendingChange] = useState<PendingChange | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const multiStore = managerScopeChoiceAvailable(activeLocationCount);
  const [appointScope, setAppointScope] = useState<ManagerScope>(defaultManagerScope(activeLocationCount));

  const blockReason = managerRoleBlockReason(staff, selfStaffId);
  const actionLabel = staff.isManager ? t('revokeManager') : t('appointManager');
  const hintId = `manager-role-hint-${staff.staffId}`;
  // Only offer a scope change when the current scope is known (0156 payload).
  const otherScope: ManagerScope | null = staff.managerScope === 'tenant' ? 'location' : staff.managerScope === 'location' ? 'tenant' : null;
  const canChangeScope = multiStore && staff.isManager && otherScope !== null && !blockReason;

  function openPrimary() {
    setError(null);
    setSuccess(null);
    setPendingChange(
      staff.isManager
        ? // Revoke removes every manager assignment whatever the scope; the RPC still needs one.
          { isManager: false, scope: staff.managerScope ?? 'tenant', kind: 'revoke' }
        : { isManager: true, scope: multiStore ? appointScope : 'tenant', kind: 'appoint' },
    );
  }

  function openScopeChange() {
    if (!otherScope) return;
    setError(null);
    setSuccess(null);
    setPendingChange({ isManager: true, scope: otherScope, kind: 'scope' });
  }

  function handleConfirm() {
    const change = pendingChange;
    if (!change) return;
    setError(null);
    setSuccess(null);
    const formData = new FormData();
    formData.set('staffId', staff.staffId);
    formData.set('isManager', change.isManager ? 'true' : 'false');
    formData.set('scope', change.scope);
    startTransition(async () => {
      const result = await setEmployeeManagerRole(formData);
      setPendingChange(null);
      if (result.status === 'success') {
        setSuccess(change.kind === 'scope' ? scopeCopy.changed : result.data.isManager ? t('managerAppointed') : t('managerRevoked'));
        onChange();
      } else {
        setError(t(managerRoleErrorCopyKey(result.code)));
      }
    });
  }

  const confirmTitle =
    pendingChange?.kind === 'scope' ? scopeCopy.changeConfirmTitle : pendingChange?.kind === 'revoke' ? t('revokeManagerConfirmTitle') : t('appointManagerConfirmTitle');
  const confirmLabel =
    pendingChange?.kind === 'scope'
      ? pendingChange.scope === 'tenant'
        ? scopeCopy.changeToTenant
        : scopeCopy.changeToLocation
      : pendingChange?.kind === 'revoke'
        ? t('revokeManager')
        : t('appointManager');

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
      {multiStore && staff.isManager && staff.managerScope ? (
        <p style={{ margin: '6px 0 0', fontSize: 13, fontWeight: 600 }}>
          {staff.managerScope === 'tenant' ? scopeCopy.currentTenant : scopeCopy.currentLocation}
        </p>
      ) : null}

      {multiStore && !staff.isManager && !blockReason ? (
        <fieldset style={{ border: 0, margin: '10px 0 0', padding: 0, minWidth: 0 }}>
          <legend style={{ fontSize: 13, ...mutedText, padding: 0 }}>{scopeCopy.legend}</legend>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0 20px' }}>
            {(['location', 'tenant'] as const).map((scope) => (
              <label key={scope} style={{ ...checkboxLabel, fontSize: 14 }}>
                <input
                  type="radio"
                  name={radioName}
                  value={scope}
                  checked={appointScope === scope}
                  onChange={() => setAppointScope(scope)}
                  disabled={isPending}
                  style={checkboxInput}
                />
                {scope === 'location' ? scopeCopy.location : scopeCopy.tenant}
              </label>
            ))}
          </div>
          <p style={{ margin: '2px 0 0', fontSize: 12, ...mutedText }}>{appointScope === 'location' ? scopeCopy.locationHint : scopeCopy.tenantHint}</p>
        </fieldset>
      ) : null}

      {error ? <div role="alert" style={{ ...alertDanger, marginTop: 8 }}>{error}</div> : null}
      {success ? (
        <div role="status" style={{ ...alertSuccess, marginTop: 8 }}>
          {success}
        </div>
      ) : null}
      <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {blockReason ? (
          <button type="button" style={buttonDisabled} disabled aria-describedby={hintId}>
            {actionLabel}
          </button>
        ) : (
          <LoadingButton
            type="button"
            pending={isPending && pendingChange?.kind !== 'scope'}
            pendingLabel={t('saving')}
            disabled={isPending}
            style={buttonSecondary}
            pendingStyle={buttonDisabled}
            className={hoverStyles.buttonSecondary}
            onClick={openPrimary}
          >
            {actionLabel}
          </LoadingButton>
        )}
        {canChangeScope && otherScope ? (
          <LoadingButton
            type="button"
            pending={isPending && pendingChange?.kind === 'scope'}
            pendingLabel={t('saving')}
            disabled={isPending}
            style={buttonSecondary}
            pendingStyle={buttonDisabled}
            className={hoverStyles.buttonSecondary}
            onClick={openScopeChange}
          >
            {otherScope === 'tenant' ? scopeCopy.changeToTenant : scopeCopy.changeToLocation}
          </LoadingButton>
        ) : null}
      </div>
      {blockReason ? (
        <p id={hintId} style={{ margin: '6px 0 0', fontSize: 12, ...mutedText }}>
          {t(blockReason)}
        </p>
      ) : null}

      <ConfirmDialog
        open={pendingChange !== null}
        title={confirmTitle}
        confirmLabel={confirmLabel}
        cancelLabel={t('cancel')}
        pending={isPending}
        danger={pendingChange?.kind === 'revoke'}
        onCancel={() => setPendingChange(null)}
        onConfirm={handleConfirm}
      >
        <strong style={{ display: 'block', marginBottom: 6 }}>{staff.name}</strong>
        {pendingChange?.kind === 'scope'
          ? pendingChange.scope === 'tenant'
            ? scopeCopy.changeToTenantBody
            : scopeCopy.changeToLocationBody
          : pendingChange?.kind === 'revoke'
            ? t('revokeManagerConfirmBody')
            : t('appointManagerConfirmBody')}
        {pendingChange?.kind === 'appoint' && multiStore ? (
          <span style={{ display: 'block', marginTop: 6, fontWeight: 600 }}>
            {scopeCopy.legend}: {pendingChange.scope === 'location' ? scopeCopy.location : scopeCopy.tenant}
          </span>
        ) : null}
      </ConfirmDialog>
    </section>
  );
}
