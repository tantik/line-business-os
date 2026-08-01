'use client';

import { useState } from 'react';
import { previewSignOut } from './actions/session-actions';
import { buttonDisabled, buttonSecondary } from '@/lib/demo/cafe/theme';
import { useLang } from '@/lib/demo/cafe/i18n';

const LABEL: Record<'ja' | 'en', string> = {
  ja: 'ログアウト',
  en: 'Log out',
};

const LABEL_PENDING: Record<'ja' | 'en', string> = {
  ja: 'ログアウト中...',
  en: 'Logging out...',
};

/**
 * Visible Preview sign-out action, available on both the Staff and Manager
 * Preview screens. Submits via the native `<form action={previewSignOut}>`
 * mechanism (no client fetch, no manual redirect handling) - `onSubmit` only
 * flips a local pending flag for the disabled/loading button state, same
 * pattern as `SignInForm`. `previewSignOut` always redirects away
 * (unmounting this component) even if the remote token-revoke call fails, so
 * there is no case where the flag needs a manual reset.
 */
export function PreviewLogoutButton() {
  const { lang } = useLang();
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <form action={previewSignOut} onSubmit={() => setIsSubmitting(true)}>
      <button type="submit" disabled={isSubmitting} style={{ ...(isSubmitting ? buttonDisabled : buttonSecondary), fontSize: 14 }}>
        {isSubmitting ? LABEL_PENDING[lang] : LABEL[lang]}
      </button>
    </form>
  );
}
