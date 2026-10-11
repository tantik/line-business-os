'use client';

import { useState, useTransition } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { setPasswordAndAcceptInvitation } from '@/lib/workforce/invitation-actions';
import { useAuthT } from '@/components/auth/AuthShell';
import { NewPasswordFields } from '@/components/auth/NewPasswordFields';
import { validateNewPassword } from '@/lib/auth/password-rules';
import type { AuthCopyKey } from '@/lib/auth/auth-copy';
import { alertDanger, buttonDisabled, buttonPrimary } from '@/lib/ui/theme';

// Fixed copy per status -- never pass through the underlying result's
// `message` (written in English internally, e.g. by the shared pg-error
// mapper or the action's own guard clauses).
function describeError(result: { status: string }): AuthCopyKey {
  switch (result.status) {
    case 'not_found':
      return 'inviteNotFound';
    case 'unauthorized':
      return 'inviteUnauthorized';
    default:
      return 'genericError';
  }
}

export function SetPasswordForm({ invitationId }: { invitationId: string }) {
  const t = useAuthT();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<AuthCopyKey | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    const problem = validateNewPassword(String(formData.get('password') ?? ''), String(formData.get('confirmPassword') ?? ''));
    if (problem) {
      setError(problem);
      return;
    }
    formData.set('invitationId', invitationId);

    startTransition(async () => {
      const result = await setPasswordAndAcceptInvitation(formData);
      if (result.status === 'success') {
        router.push('/staff');
      } else {
        setError(describeError(result));
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
      {error ? (
        <p role="alert" style={alertDanger}>
          {t(error)}
        </p>
      ) : null}
      <NewPasswordFields disabled={isPending} passwordLabel="password" />
      <button type="submit" disabled={isPending} style={{ ...(isPending ? buttonDisabled : buttonPrimary), width: '100%' }}>
        {isPending ? t('inviteSaving') : t('inviteButton')}
      </button>
    </form>
  );
}
