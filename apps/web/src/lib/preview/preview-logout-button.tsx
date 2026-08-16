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
 *
 * `returnTo` is the canonical preview path of the page this button is
 * rendered on (e.g. `/mame-to-cha/manager`) - carried as a hidden field so
 * `previewSignOut` can send the user back to sign-in for the page they were
 * actually on (FA-01: a Manager logging out must sign back in to the Manager
 * dashboard, not the generic Staff route). The value is untrusted client
 * input by the time the Server Action reads it and is re-validated there
 * against the same allowlist (`sanitizePreviewReturnTo`) as every other
 * `returnTo` in this app.
 */
export function PreviewLogoutButton({ returnTo }: { returnTo: string }) {
  const { lang } = useLang();
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <form action={previewSignOut} onSubmit={() => setIsSubmitting(true)}>
      <input type="hidden" name="returnTo" value={returnTo} />
      <button type="submit" disabled={isSubmitting} style={{ ...(isSubmitting ? buttonDisabled : buttonSecondary), fontSize: 14 }}>
        {isSubmitting ? LABEL_PENDING[lang] : LABEL[lang]}
      </button>
    </form>
  );
}
