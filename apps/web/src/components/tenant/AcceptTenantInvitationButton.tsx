'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { acceptPendingTenantInvitation } from '@/lib/tenant/tenant-invitation-actions';
import { buttonDisabled, buttonPrimary } from '@/lib/ui/theme';

// Fixed JA copy per status (same convention as AcceptInvitationButton) --
// never the underlying error text.
function describeError(status: string): string {
  switch (status) {
    case 'not_acceptable':
    case 'none_pending':
      return 'この招待はすでに無効になっています。';
    case 'expired':
      return 'この招待は有効期限が切れています。';
    default:
      return '承認できませんでした。もう一度お試しください。';
  }
}

/** Accepts one tenant (Owner) invitation and opens that store's workspace. */
export function AcceptTenantInvitationButton({ invitationId }: { invitationId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleAccept() {
    setError(null);
    const formData = new FormData();
    formData.set('invitationId', invitationId);
    startTransition(async () => {
      const result = await acceptPendingTenantInvitation(formData);
      if (result.status === 'success') {
        router.push(result.destination);
        router.refresh();
      } else {
        setError(describeError(result.status));
      }
    });
  }

  return (
    <span style={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
      <button type="button" style={isPending ? buttonDisabled : buttonPrimary} disabled={isPending} aria-busy={isPending} onClick={handleAccept}>
        {isPending ? '処理中…' : '承認して開始する'}
      </button>
      {error ? (
        <span role="alert" style={{ color: '#b00020', fontSize: 13 }}>
          {error}
        </span>
      ) : null}
    </span>
  );
}
