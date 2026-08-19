'use client';

import { useState, useTransition } from 'react';
import type { FormEvent } from 'react';
import type { WorkforceStaffManageEntry } from '@/lib/workforce/employees';
import { deleteEmployee, upsertEmployee } from '@/lib/workforce/staff-actions';
import { ConfirmDialog } from '@/components/shared/design-kit';
import { alertDanger, buttonDisabled, buttonPrimary, buttonSecondary, colors, input, mutedText } from '@/lib/ui/theme';
import hoverStyles from '@/lib/ui/theme.module.css';
import { buttonDanger } from '../_ui/workforce-theme';
import { useLang } from '@/lib/demo/cafe/i18n';
import { describeWriteError } from './error-copy';
import { tManagerDashboard } from './manager-dashboard-i18n';

/** Localizes the subset of `WorkforceWriteResult` statuses this form can actually receive; falls back to the shared (English) copy for statuses this form's own action never returns. */
function localizedFormError(result: Parameters<typeof describeWriteError>[0], t: (key: Parameters<typeof tManagerDashboard>[1]) => string) {
  switch (result.status) {
    case 'not_found':
      return t('errorNotFound');
    case 'not_authenticated':
      return t('errorNotAuthenticated');
    case 'no_membership':
      return t('errorNoMembership');
    default:
      return describeWriteError(result);
  }
}

export interface StaffFormProps {
  locationId: string;
  /** Omit/undefined to create a new employee; pass an existing entry to edit it. Active/inactive is handled by a separate action, not this form. */
  employee?: WorkforceStaffManageEntry;
  onSuccess: () => void;
  onCancel: () => void;
}

export function StaffForm({ locationId, employee, onSuccess, onCancel }: StaffFormProps) {
  const { lang } = useLang();
  const t = (key: Parameters<typeof tManagerDashboard>[1]) => tManagerDashboard(lang, key);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [isDeletePending, startDeleteTransition] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  function handleDelete() {
    if (!employee) return;
    setDeleteError(null);
    const formData = new FormData();
    formData.set('staffId', employee.staffId);
    startDeleteTransition(async () => {
      const result = await deleteEmployee(formData);
      if (result.status === 'success') {
        setConfirmDeleteOpen(false);
        onSuccess();
      } else {
        setConfirmDeleteOpen(false);
        setDeleteError(result.status === 'blocked_by_history' ? t('staffBlockedByHistory') : localizedFormError(result, t));
      }
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    if (employee) formData.set('id', employee.staffId);
    // Preserve the employee's own location on edit (the page's active location is only a create-time default) -- this manager page can list staff across locations, and an edit shouldn't silently move someone.
    formData.set('locationId', employee?.locationId ?? locationId);

    startTransition(async () => {
      const result = await upsertEmployee(formData);
      if (result.status === 'success') {
        onSuccess();
      } else {
        setError(localizedFormError(result, t));
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12, maxWidth: 360 }}>
      {error ? <div style={alertDanger}>{error}</div> : null}
      <label>
        <span style={{ ...mutedText, fontSize: 13 }}>{t('fieldName')}</span>
        <input style={input} name="name" defaultValue={employee?.name ?? ''} maxLength={120} required />
      </label>
      <label>
        <span style={{ ...mutedText, fontSize: 13 }}>{t('fieldFamilyName')}</span>
        <input style={input} name="familyName" defaultValue={employee?.familyName ?? ''} maxLength={80} required />
      </label>
      <label>
        <span style={{ ...mutedText, fontSize: 13 }}>{t('fieldGivenName')}</span>
        <input style={input} name="givenName" defaultValue={employee?.givenName ?? ''} maxLength={80} required />
      </label>
      <label>
        <span style={{ ...mutedText, fontSize: 13 }}>{t('fieldEmail')}</span>
        <input style={input} type="email" name="email" defaultValue={employee?.email ?? ''} maxLength={254} required />
      </label>
      <label>
        <span style={{ ...mutedText, fontSize: 13 }}>{t('fieldPosition')}</span>
        <input style={input} name="positionLabel" defaultValue={employee?.positionLabel ?? ''} maxLength={60} />
      </label>
      <label>
        <span style={{ ...mutedText, fontSize: 13 }}>{t('fieldEmploymentType')}</span>
        <input style={input} name="employmentType" defaultValue={employee?.employmentType ?? ''} maxLength={40} />
      </label>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" className={hoverStyles.buttonPrimary} style={isPending ? buttonDisabled : buttonPrimary} disabled={isPending}>
          {isPending ? t('saving') : employee ? t('saveChanges') : t('addStaffSubmit')}
        </button>
        <button type="button" className={hoverStyles.buttonSecondary} style={buttonSecondary} onClick={onCancel} disabled={isPending}>
          {t('cancel')}
        </button>
      </div>

      {employee ? (
        <div style={{ marginTop: 4, paddingTop: 10, borderTop: `1px solid ${colors.border}` }}>
          {deleteError ? <div style={alertDanger}>{deleteError}</div> : null}
          <button
            type="button"
            className={hoverStyles.buttonDanger}
            style={isDeletePending ? buttonDisabled : buttonDanger}
            disabled={isDeletePending}
            onClick={() => setConfirmDeleteOpen(true)}
          >
            {isDeletePending ? t('deletingStaff') : t('deleteStaffButton')}
          </button>
          {/* Warn before the click, not just on a failed delete attempt -- same wording the RPC guard (0056) produces on an actual blocked attempt, so the two never disagree. The button stays enabled; this only makes the outcome predictable. */}
          {employee.hasProtectedHistory ? (
            <p style={{ margin: '6px 0 0', fontSize: 12, ...mutedText }}>{t('staffBlockedByHistory')}</p>
          ) : null}
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmDeleteOpen}
        title={t('confirmDeleteStaffTitle')}
        confirmLabel={t('deleteStaffButton')}
        cancelLabel={t('cancel')}
        pending={isDeletePending}
        danger
        onCancel={() => setConfirmDeleteOpen(false)}
        onConfirm={handleDelete}
      >
        {t('confirmDeleteStaffBody')}
      </ConfirmDialog>
    </form>
  );
}
