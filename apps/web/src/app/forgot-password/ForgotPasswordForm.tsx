'use client';

import { useState, useTransition } from 'react';
import type { FormEvent } from 'react';
import { requestPasswordReset } from '@/lib/auth/actions';
import { AuthLink, authInput, useAuthT } from '@/components/auth/AuthShell';
import { alertDanger, buttonDisabled, buttonPrimary, mutedText } from '@/lib/ui/theme';

export function ForgotPasswordForm() {
  const t = useAuthT();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<'forgotInvalidEmail' | 'forgotRetryLater' | null>(null);
  const [sent, setSent] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await requestPasswordReset(formData);
      if (result.status === 'sent') setSent(true);
      else setError(result.status === 'invalid_email' ? 'forgotInvalidEmail' : 'forgotRetryLater');
    });
  }

  if (sent) {
    return (
      <div role="status">
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>{t('forgotSentTitle')}</h2>
        <p style={mutedText}>{t('forgotSentBody')}</p>
        <AuthLink href="/sign-in" k="backToSignIn" />
      </div>
    );
  }

  return (
    <>
      <p style={{ ...mutedText, marginTop: 0 }}>{t('forgotLead')}</p>
      {error ? (
        <p role="alert" style={alertDanger}>
          {t(error)}
        </p>
      ) : null}
      <form onSubmit={handleSubmit} noValidate>
        <label style={{ display: 'block', marginBottom: 12 }}>
          {t('email')}
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            disabled={isPending}
            style={authInput}
          />
        </label>
        <button type="submit" disabled={isPending} style={{ ...(isPending ? buttonDisabled : buttonPrimary), width: '100%' }}>
          {isPending ? t('forgotSending') : t('forgotButton')}
        </button>
      </form>
      <div style={{ marginTop: 8, textAlign: 'center' }}>
        <AuthLink href="/sign-in" k="backToSignIn" />
      </div>
    </>
  );
}
