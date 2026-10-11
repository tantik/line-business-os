'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import { signIn } from '@/lib/auth/actions';
import { AuthLink, authInput, useAuthT } from '@/components/auth/AuthShell';
import type { AuthCopyKey } from '@/lib/auth/auth-copy';
import { alertDanger, buttonDisabled, buttonPrimary, mutedText } from '@/lib/ui/theme';

const labelStyle = { display: 'block', marginBottom: 12 } as const;
const ERROR_ID = 'sign-in-error';

/**
 * Client wrapper around the `signIn` Server Action form. Submission itself
 * still goes through the native `<form action={signIn}>` mechanism (no
 * client-side fetch, no manual redirect handling) — `onSubmit` only blocks an
 * empty submit (page-language message instead of the browser bubble, hence
 * `noValidate`) and flips a local `isSubmitting` flag. A failed sign-in
 * re-renders `/sign-in?error=1` fresh from the server, resetting this state.
 */
export function SignInForm({ returnTo, hasError }: { returnTo: string | null; hasError: boolean }) {
  const t = useAuthT();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState<AuthCopyKey | null>(null);
  const error: AuthCopyKey | null = localError ?? (hasError ? 'signInError' : null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const data = new FormData(event.currentTarget);
    if (!String(data.get('email') ?? '').trim() || !String(data.get('password') ?? '')) {
      event.preventDefault();
      setLocalError('signInMissing');
      return;
    }
    setLocalError(null);
    setIsSubmitting(true);
  }

  const describedBy = error ? ERROR_ID : undefined;

  return (
    <>
      {error ? (
        <p id={ERROR_ID} role="alert" style={alertDanger}>
          {t(error)}
        </p>
      ) : null}
      <form action={signIn} onSubmit={handleSubmit} noValidate>
        {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
        <label style={labelStyle}>
          {t('email')}
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            disabled={isSubmitting}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            style={authInput}
          />
        </label>
        <label style={labelStyle}>
          {t('password')}
          <input
            type="password"
            name="password"
            required
            autoComplete="current-password"
            disabled={isSubmitting}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            style={authInput}
          />
        </label>
        <button type="submit" disabled={isSubmitting} style={{ ...(isSubmitting ? buttonDisabled : buttonPrimary), width: '100%' }}>
          {isSubmitting ? t('signingIn') : t('signInButton')}
        </button>
      </form>
      <div style={{ marginTop: 8, textAlign: 'center' }}>
        <AuthLink href="/forgot-password" k="forgotLink" />
      </div>
      <p style={{ ...mutedText, fontSize: 13, marginBottom: 0 }}>{t('noAccountHint')}</p>
    </>
  );
}
