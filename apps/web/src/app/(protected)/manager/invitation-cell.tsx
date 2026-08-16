'use client';

import { useState, useTransition } from 'react';
import { inviteOrResendEmployee, revokeEmployeeInvitation } from '@/lib/workforce/invitation-actions';
import type { WorkforceEmployeeInvitation } from '@/lib/workforce/invitations';
import { badgeStyle, buttonDisabled, buttonSecondary, colors, mutedText } from '@/lib/ui/theme';

/**
 * JA-only per Founder direction: localize the NEW Staff Auth Provisioning
 * concepts (this cell) without touching the surrounding Manager dashboard's
 * existing English copy (see the local implementation report §11's own
 * scope note -- this file is the follow-up, not a reversal of that call).
 */
// Fixed JA copy per status -- never pass through the underlying result's
// `message` (shared infra text, written in English across this codebase's
// existing screens; surfacing it here would produce mixed-language errors).
function describeInviteError(result: { status: string }): string {
  switch (result.status) {
    case 'not_found':
      return '従業員が見つかりません。';
    case 'duplicate':
      return 'この従業員はすでにアクセス権を持っています。';
    case 'unauthorized':
      return 'この操作を行う権限がありません。';
    default:
      return '招待を送信できませんでした。もう一度お試しください。';
  }
}

function describeRevokeError(result: { status: string }): string {
  switch (result.status) {
    case 'not_found':
      return 'この招待はすでに存在しません。';
    case 'unauthorized':
      return 'この操作を行う権限がありません。';
    default:
      return '取り消せませんでした。もう一度お試しください。';
  }
}

export interface InvitationCellProps {
  hasAccountAccess: boolean;
  employeeId: string;
  /** The employee's single current invitation row, if any (manager view only ever needs the latest -- see manager-dashboard-client.tsx's own selection). */
  invitation: WorkforceEmployeeInvitation | null;
  onChange: () => void;
}

export function InvitationCell({ hasAccountAccess, employeeId, invitation, onChange }: InvitationCellProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleInviteOrResend() {
    setError(null);
    const formData = new FormData();
    formData.set('employeeId', employeeId);
    startTransition(async () => {
      const result = await inviteOrResendEmployee(formData);
      if (result.status === 'success') {
        onChange();
      } else {
        setError(describeInviteError(result));
      }
    });
  }

  function handleRevoke() {
    if (!invitation) return;
    if (!window.confirm('この招待を取り消しますか？')) return;
    setError(null);
    const formData = new FormData();
    formData.set('invitationId', invitation.invitationId);
    startTransition(async () => {
      const result = await revokeEmployeeInvitation(formData);
      if (result.status === 'success') {
        onChange();
      } else {
        setError(describeRevokeError(result));
      }
    });
  }

  if (hasAccountAccess) {
    return <span style={badgeStyle('active')}>アクセス有効</span>;
  }

  const isPendingInvite = invitation && invitation.status === 'pending' && !invitation.isExpired;
  const isExpired = invitation && invitation.status === 'pending' && invitation.isExpired;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      {isPendingInvite ? (
        <span style={badgeStyle('neutral')}>招待中</span>
      ) : isExpired ? (
        <span style={badgeStyle('inactive')}>期限切れ</span>
      ) : null}
      <button
        type="button"
        style={isPending ? buttonDisabled : buttonSecondary}
        disabled={isPending}
        onClick={handleInviteOrResend}
      >
        {isPending ? '送信中…' : isPendingInvite || isExpired ? '再送信' : '招待する'}
      </button>
      {isPendingInvite ? (
        <button type="button" style={isPending ? buttonDisabled : buttonSecondary} disabled={isPending} onClick={handleRevoke}>
          取り消す
        </button>
      ) : null}
      {error ? <span style={{ ...mutedText, color: colors.dangerText, fontSize: 12 }}>{error}</span> : null}
    </div>
  );
}
