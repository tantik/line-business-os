'use client';

import { useState, useTransition } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { completePasswordReset } from '@/lib/auth/actions';
import { useAuthT } from '@/components/auth/AuthShell';
import { NewPasswordFields } from '@/components/auth/NewPasswordFields';
import { validateNewPassword } from '@/lib/auth/password-rules';
import type { AuthCopyKey } from '@/lib/auth/auth-copy';
import { alertDanger, buttonDisabled, buttonPrimary, colors } from '@/lib/ui/theme';

const successBox = {
  border: `1px solid ${colors.success}`,
  background: colors.successMuted,
  color: colors.textPrimary,
  borderRadius: 8,
  padding: '8px 12px',
  fontSize: 14,
} as const;

const ERROR_COPY: Record<string, AuthCopyKey> = {
  too_short: 'passwordTooShort',
  same_password: 'passwordSameAsOld',
  weak_password: 'passwordWeak',
  error: 'genericError',
};

export function ResetPasswordForm() {
  const t = useAuthT();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<AuthCopyKey | null>(null);
  const [done, setDone] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    const problem = validateNewPassword(String(formData.get('password') ?? ''), String(formData.get('confirmPassword') ?? ''));
    if (problem) {
      setError(problem);
      return;
    }
    startTransition(async () => {
      const result = await completePasswordReset(formData);
      if (result.status === 'success') {
        // Say it worked before moving on, so the change is not silent.
        setDone(true);
        const destination = result.destination;
        window.setTimeout(() => router.replace(destination), 1500);
      } else if (result.status === 'link_invalid') router.replace('/auth/link-invalid?reason=reset');
      else setError(ERROR_COPY[result.status] ?? 'genericError');
    });
  }

  if (done) {
    return (
      <p role="status" style={successBox}>
        {t('passwordChanged')}
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {error ? (
        <p role="alert" style={alertDanger}>
          {t(error)}
        </p>
      ) : null}
      <NewPasswordFields disabled={isPending} passwordLabel="newPassword" />
      <button type="submit" disabled={isPending} style={{ ...(isPending ? buttonDisabled : buttonPrimary), width: '100%' }}>
        {isPending ? t('resetSaving') : t('resetButton')}
      </button>
    </form>
  );
}
