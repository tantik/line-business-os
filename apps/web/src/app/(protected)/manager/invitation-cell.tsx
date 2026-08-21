'use client';

import { useState, useTransition } from 'react';
import { inviteOrResendEmployee, recoverEmployeeAccess, revokeEmployeeInvitation } from '@/lib/workforce/invitation-actions';
import type { WorkforceEmployeeInvitation } from '@/lib/workforce/invitations';
import type { Lang } from '@/lib/demo/cafe/i18n';
import { ConfirmDialog } from '@/components/shared/design-kit';
import { badgeStyle, buttonDisabled, buttonSecondary, colors, mutedText } from '@/lib/ui/theme';
import hoverStyles from '@/lib/ui/theme.module.css';
import { tManagerDashboard } from './manager-dashboard-i18n';

type T = (key: Parameters<typeof tManagerDashboard>[1]) => string;

// Never passes through the underlying result's own `message` (shared infra
// text, written in English across this codebase's existing screens;
// surfacing it here would produce mixed-language errors) -- always one of
// this fixed, localized set instead.
function describeInviteError(result: { status: string }, t: T): string {
  switch (result.status) {
    case 'not_found':
      return t('inviteErrorNotFound');
    case 'duplicate':
      return t('inviteErrorDuplicate');
    case 'unauthorized':
      return t('errorUnauthorizedAction');
    default:
      return t('inviteErrorGeneric');
  }
}

function describeRevokeError(result: { status: string }, t: T): string {
  switch (result.status) {
    case 'not_found':
      return t('revokeErrorNotFound');
    case 'unauthorized':
      return t('errorUnauthorizedAction');
    default:
      return t('revokeErrorGeneric');
  }
}

/**
 * Defect C recovery-specific copy -- distinct from `describeInviteError`
 * because "employee_not_yet_invited" only makes sense on this action (the
 * button itself is never shown before a first invite anyway, but the
 * Edge Function still enforces it server-side).
 */
function describeRecoverError(result: { status: string }, t: T): string {
  switch (result.status) {
    case 'unauthorized':
      return t('errorUnauthorizedAction');
    default:
      return t('recoverErrorGeneric');
  }
}

export interface InvitationCellProps {
  hasAccountAccess: boolean;
  employeeId: string;
  /** The employee's single current invitation row, if any (manager view only ever needs the latest -- see manager-dashboard-client.tsx's own selection). */
  invitation: WorkforceEmployeeInvitation | null;
  onChange: () => void;
  lang: Lang;
}

/**
 * 2026-08-21: fully bilingual now. Previously JA-only per an older Founder
 * scope decision (F4) made when the surrounding Manager dashboard was still
 * English-only -- the whole popup this cell lives in is bilingual today
 * (see manage-staff-popup.tsx's own redesign), so a JA-only cell inside it
 * read as a missing translation rather than a deliberate choice. Founder
 * confirmed 2026-08-21: localize it like everything else around it.
 */
export function InvitationCell({ hasAccountAccess, employeeId, invitation, onChange, lang }: InvitationCellProps) {
  const t: T = (key) => tManagerDashboard(lang, key);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [recoverySent, setRecoverySent] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'recover' | 'revoke' | null>(null);

  function handleInviteOrResend() {
    setError(null);
    setRecoverySent(false);
    const formData = new FormData();
    formData.set('employeeId', employeeId);
    startTransition(async () => {
      const result = await inviteOrResendEmployee(formData);
      if (result.status === 'success') {
        onChange();
      } else {
        setError(describeInviteError(result, t));
      }
    });
  }

  function handleRecover() {
    setError(null);
    setRecoverySent(false);
    const formData = new FormData();
    formData.set('employeeId', employeeId);
    startTransition(async () => {
      const result = await recoverEmployeeAccess(formData);
      if (result.status === 'success') {
        setRecoverySent(true);
      } else {
        setError(describeRecoverError(result, t));
      }
    });
  }

  function handleRevoke() {
    if (!invitation) return;
    setError(null);
    setRecoverySent(false);
    const formData = new FormData();
    formData.set('invitationId', invitation.invitationId);
    startTransition(async () => {
      const result = await revokeEmployeeInvitation(formData);
      if (result.status === 'success') {
        onChange();
      } else {
        setError(describeRevokeError(result, t));
      }
    });
  }

  if (hasAccountAccess) {
    return <span style={badgeStyle('active')}>{t('accessActiveShort')}</span>;
  }

  const isPendingInvite = invitation && invitation.status === 'pending' && !invitation.isExpired;
  const isExpired = invitation && invitation.status === 'pending' && invitation.isExpired;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      {isPendingInvite ? (
        <span style={badgeStyle('neutral')}>{t('accessPendingShort')}</span>
      ) : isExpired ? (
        <span style={badgeStyle('inactive')}>{t('accessExpiredShort')}</span>
      ) : null}
      <button
        type="button"
        className={hoverStyles.buttonSecondary}
        style={isPending ? buttonDisabled : buttonSecondary}
        disabled={isPending}
        onClick={handleInviteOrResend}
      >
        {isPending ? t('sendingStatus') : isPendingInvite || isExpired ? t('resendButton') : t('inviteButton')}
      </button>
      {isPendingInvite || isExpired ? (
        <button type="button" className={hoverStyles.buttonSecondary} style={isPending ? buttonDisabled : buttonSecondary} disabled={isPending} onClick={() => setConfirmAction('recover')}>
          {t('recoverAccessButton')}
        </button>
      ) : null}
      {isPendingInvite ? (
        <button type="button" className={hoverStyles.buttonSecondary} style={isPending ? buttonDisabled : buttonSecondary} disabled={isPending} onClick={() => setConfirmAction('revoke')}>
          {t('revokeInvitationButton')}
        </button>
      ) : null}
      {recoverySent ? <span style={{ ...mutedText, color: colors.success, fontSize: 12 }}>{t('recoveryEmailSentMessage')}</span> : null}
      {error ? <span style={{ ...mutedText, color: colors.dangerText, fontSize: 12 }}>{error}</span> : null}

      <ConfirmDialog
        open={confirmAction === 'recover'}
        title={t('confirmRecoverAccessTitle')}
        confirmLabel={t('confirmSendButton')}
        cancelLabel={t('cancel')}
        pending={isPending}
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => {
          setConfirmAction(null);
          handleRecover();
        }}
      >
        {t('confirmRecoverAccessBody')}
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmAction === 'revoke'}
        title={t('confirmRevokeInvitationTitle')}
        confirmLabel={t('revokeInvitationButton')}
        cancelLabel={t('cancel')}
        pending={isPending}
        danger
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => {
          setConfirmAction(null);
          handleRevoke();
        }}
      >
        {t('confirmRevokeInvitationBody')}
      </ConfirmDialog>
    </div>
  );
}
