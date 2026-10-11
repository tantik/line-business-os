'use client';

import { useEffect } from 'react';

/**
 * Last-resort boundary for a failure in the root layout itself, where no
 * providers or styles are available. Static bilingual text (JA first).
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[app] root layout error', error);
  }, [error]);

  return (
    <html lang="ja">
      <body style={{ fontFamily: 'system-ui, sans-serif', margin: 0, padding: 24, background: '#FAF3E8', color: '#2B2118' }}>
        <main style={{ maxWidth: 440, margin: '40px auto' }}>
          <p style={{ fontSize: 24, fontWeight: 700, letterSpacing: '0.08em' }}>ORUWA</p>
          <h1 style={{ fontSize: 20 }}>エラーが発生しました</h1>
          <p>予期しないエラーが発生しました。もう一度お試しください。</p>
          <p lang="en" style={{ color: '#6B5D4F' }}>Something went wrong. Please try again.</p>
          <button
            type="button"
            onClick={reset}
            style={{ minHeight: 44, padding: '10px 16px', border: 'none', borderRadius: 8, background: '#4F7A4F', color: '#FFFFFF', fontSize: 14, fontWeight: 600 }}
          >
            もう一度試す / Try again
          </button>
        </main>
      </body>
    </html>
  );
}
