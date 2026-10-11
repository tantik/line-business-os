'use client';

import { useEffect } from 'react';
import { AuthLink, AuthShell, AuthText, useAuthT } from '@/components/auth/AuthShell';
import { buttonPrimary } from '@/lib/ui/theme';

function RetryButton({ reset }: { reset: () => void }) {
  const t = useAuthT();
  return (
    <button type="button" onClick={reset} style={{ ...buttonPrimary, width: '100%' }}>
      {t('retry')}
    </button>
  );
}

/**
 * Error boundary for routes outside `(protected)` (sign-in, account screens,
 * public pages). Logs the real error for developers; shows a generic JA/EN
 * message only.
 */
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[app] route error', error);
  }, [error]);

  return (
    <AuthShell title="errorTitle">
      <AuthText k="errorBody" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <RetryButton reset={reset} />
        <div style={{ textAlign: 'center' }}>
          <AuthLink href="/" k="goHome" />
        </div>
      </div>
    </AuthShell>
  );
}
