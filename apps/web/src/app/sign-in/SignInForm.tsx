'use client';

import { useState } from 'react';
import { signIn } from '@/lib/auth/actions';
import { buttonDisabled, buttonPrimary, input as inputStyle } from '@/lib/ui/theme';

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
export function SignInForm({ returnTo }: { returnTo: string | null }) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <form action={signIn} onSubmit={() => setIsSubmitting(true)}>
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
      <label style={labelStyle}>
        Email
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
        Password
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
        {isSubmitting ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
