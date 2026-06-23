'use client';

import { useEffect } from 'react';
import { ErrorState } from '@/components/states';

/**
 * Error boundary for the protected route group. Logs the real error for
 * developers but shows users a generic, safe message (no internal details).
 */
export default function ProtectedError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    console.error('[protected] route error', error);
  }, [error]);

  return <ErrorState />;
}
