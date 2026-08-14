'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { acceptEmployeeInvitation } from '@/lib/workforce/invitation-actions';
import { buttonDisabled, buttonPrimary } from '@/lib/ui/theme';

// Fixed JA copy per status -- never pass through the underlying result's
// `message` (shared infra text, written in English).
function describeError(result: { status: string }): string {
  switch (result.status) {
    case 'not_found':
      return 'この招待はすでに無効になっています。';
    default:
      return '承認できませんでした。もう一度お試しください。';
  }
}

export function AcceptInvitationButton({ invitationId }: { invitationId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleAccept() {
    setError(null);
    const formData = new FormData();
    formData.set('invitationId', invitationId);
    startTransition(async () => {
      const result = await acceptEmployeeInvitation(formData);
      if (result.status === 'success') {
        router.refresh();
      } else {
        setError(describeError(result));
      }
    });
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <button type="button" style={isPending ? buttonDisabled : buttonPrimary} disabled={isPending} onClick={handleAccept}>
        {isPending ? '処理中…' : '承認する'}
      </button>
      {error ? <span style={{ color: '#b00020', fontSize: 13 }}>{error}</span> : null}
    </span>
  );
}
