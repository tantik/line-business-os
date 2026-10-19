'use client';

import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { signIn } from '@/lib/auth/actions';
import { AuthLink, authInput, useAuthT } from '@/components/auth/AuthShell';
import type { AuthCopyKey } from '@/lib/auth/auth-copy';
import { alertDanger, buttonDisabled, buttonPrimary, mutedText } from '@/lib/ui/theme';

const labelStyle = { display: 'block', marginBottom: 12 } as const;
const ERROR_ID = 'sign-in-error';
/**
 * QA3 (2026-10-14): a failed sign-in re-renders `/sign-in?error=1` and the
 * typed email was lost. The email is kept for that one round-trip in this
 * tab's `sessionStorage` only -- never in the URL (no PII in query strings,
 * history, or server logs) and never sent anywhere new. Restored only when
 * `?error=1` is present, for every failure alike, so it reveals nothing about
 * whether the account exists.
 */
const EMAIL_STASH_KEY = 'oruwa:sign-in-email';

function readEmailStash(): string | null {
  try {
    return window.sessionStorage.getItem(EMAIL_STASH_KEY);
  } catch {
    return null;
  }
}

function writeEmailStash(email: string | null) {
  try {
    if (email) window.sessionStorage.setItem(EMAIL_STASH_KEY, email);
    else window.sessionStorage.removeItem(EMAIL_STASH_KEY);
  } catch {
    // Storage unavailable (private mode / disabled) -- the email simply is not kept.
  }
}

/**
 * Client wrapper around the `signIn` Server Action form. Submission itself
 * still goes through the native `<form action={signIn}>` mechanism (no
 * client-side fetch, no manual redirect handling) — `onSubmit` only blocks an
 * empty submit (page-language message instead of the browser bubble, hence
 * `noValidate`) and flips a local `isSubmitting` flag. A failed sign-in
 * re-renders `/sign-in?error=1` fresh from the server, resetting this state.
 */
export function SignInForm({ hasError }: { hasError: boolean }) {
  const t = useAuthT();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState<AuthCopyKey | null>(null);
  const error: AuthCopyKey | null = localError ?? (hasError ? 'signInError' : null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  // A plain (non-error) visit drops any leftover stash from an earlier tab
  // session -- mount only, so it never races the submit that just wrote it.
  useEffect(() => {
    if (!hasError) writeEmailStash(null);
  }, []); // mount-only by design

  // No dependency list on purpose: React resets the form after the action
  // round-trip, and this must run after whichever commit does that. Restores
  // at most once per stash (the stash is removed on restore), and never
  // overwrites something the user has typed.
  useEffect(() => {
    if (!hasError) return;
    const input = emailRef.current;
    if (!input || input.value) return;
    const saved = readEmailStash();
    if (!saved) return;
    input.value = saved;
    writeEmailStash(null);
    passwordRef.current?.focus();
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const data = new FormData(event.currentTarget);
    const email = String(data.get('email') ?? '').trim();
    if (!email || !String(data.get('password') ?? '')) {
      event.preventDefault();
      setLocalError('signInMissing');
      return;
    }
    writeEmailStash(email);
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
        <label style={labelStyle}>
          {t('email')}
          <input
            ref={emailRef}
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
            ref={passwordRef}
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
