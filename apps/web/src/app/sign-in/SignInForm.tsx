'use client';

import { useState } from 'react';
import { signIn } from '@/lib/auth/actions';
import { AuthLink, useAuthT } from '@/components/auth/AuthShell';
import { alertDanger, buttonDisabled, buttonPrimary, input as inputStyle, mutedText } from '@/lib/ui/theme';

const labelStyle = { display: 'block', marginBottom: 12 } as const;

/**
 * Client wrapper around the `signIn` Server Action form. Submission itself
 * still goes through the native `<form action={signIn}>` mechanism (no
 * client-side fetch, no manual redirect handling) — `onSubmit` only flips a
 * local `isSubmitting` flag for the pending/disabled UI before letting the
 * action proceed normally. A successful sign-in navigates away (unmounting
 * this component); a failed one re-renders `/sign-in?error=1` fresh from the
 * server, which naturally resets this state — no manual reset needed.
 */
export function SignInForm({ returnTo, hasError }: { returnTo: string | null; hasError: boolean }) {
  const t = useAuthT();
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <>
      {hasError ? (
        <p role="alert" style={alertDanger}>
          {t('signInError')}
        </p>
      ) : null}
      <form action={signIn} onSubmit={() => setIsSubmitting(true)}>
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
            style={inputStyle}
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
            style={inputStyle}
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
