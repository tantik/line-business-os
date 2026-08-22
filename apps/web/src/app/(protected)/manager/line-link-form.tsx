'use client';

import { useState, useTransition } from 'react';
import { unbindEmployeeLineUser } from '@/lib/workforce/staff-actions';
import { ConfirmDialog } from '@/components/shared/design-kit';
import { alertDanger, buttonDisabled, buttonSecondary } from '@/lib/ui/theme';
import hoverStyles from '@/lib/ui/theme.module.css';
import { describeWriteError } from './error-copy';
import type { Lang } from '@/lib/demo/cafe/i18n';
import { tManagerDashboard } from './manager-dashboard-i18n';

export interface LineLinkFormProps {
  employeeId: string;
  onSuccess: () => void;
  lang: Lang;
}

/**
 * Per-employee LINE user id Unbind control. Binding itself now happens
 * inline in `StaffForm` (a "LINE user id" field next to Email, linked
 * together with the same Save/Add submit -- Staff/LINE polish pass,
 * 2026-08-22) rather than as this component's own separate submit, so this
 * component only ever renders once an employee already has a linked id (the
 * parent only mounts it in that state). The raw id is manager-entered
 * binding data only, never authentication -- never displayed back once
 * bound (only bound/unbound state round-trips).
 */
export function LineLinkForm({ employeeId, onSuccess, lang }: LineLinkFormProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmUnbindOpen, setConfirmUnbindOpen] = useState(false);
  const t = (key: Parameters<typeof tManagerDashboard>[1]) => tManagerDashboard(lang, key);

  function handleUnbind() {
    setError(null);
    const formData = new FormData();
    formData.set('employeeId', employeeId);

    startTransition(async () => {
      const result = await unbindEmployeeLineUser(formData);
      if (result.status === 'success') {
        onSuccess();
      } else {
        setError(describeWriteError(result));
      }
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {error ? <div style={alertDanger}>{error}</div> : null}
      <button type="button" className={hoverStyles.buttonSecondary} style={isPending ? buttonDisabled : buttonSecondary} disabled={isPending} onClick={() => setConfirmUnbindOpen(true)}>
        {isPending ? t('unbinding') : t('unbindLine')}
      </button>
      <ConfirmDialog
        open={confirmUnbindOpen}
        title={t('confirmUnbindLine')}
        confirmLabel={t('unbindLine')}
        cancelLabel={t('cancel')}
        pending={isPending}
        danger
        onCancel={() => setConfirmUnbindOpen(false)}
        onConfirm={() => {
          setConfirmUnbindOpen(false);
          handleUnbind();
        }}
      >
        {''}
      </ConfirmDialog>
    </div>
  );
}
