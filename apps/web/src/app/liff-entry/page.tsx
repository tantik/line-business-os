'use client';

import { useEffect, useState } from 'react';
import { alertDanger, mutedText, pageStyle } from '@/lib/ui/theme';
import { exchangeLiffIdToken } from '@/lib/liff/liff-entry-client';

type EntryState =
  | { phase: 'initializing' }
  | { phase: 'redirecting_to_line_login' }
  | { phase: 'exchanging' }
  | { phase: 'error'; code: string };

const LIFF_CALLBACK_PATH = '/auth/liff-callback';

/**
 * LIFF entry point (Track B, B4) -- the page a LINE Rich Menu button opens
 * inside LINE's in-app browser (`docs/architecture/workforce-line-liff-entry-plan.md`
 * §7). Client-only by necessity: the LIFF SDK (`@line/liff`) only runs in the
 * browser. This page never talks to Postgres or holds any secret -- it only
 * obtains a LINE-issued ID token from the SDK and forwards it to the
 * `liff-entry` Edge Function, then hands the resulting single-use
 * `token_hash` to `/auth/liff-callback` (a server route) to actually
 * establish the session. `NEXT_PUBLIC_LIFF_ID` is the only LINE-specific
 * config this page reads -- a non-secret LIFF app id, already documented in
 * `.env.example`.
 *
 * Opened directly in a normal browser (not inside LINE), `liff.init` still
 * succeeds but `liff.isLoggedIn()` is false and `liff.login()` redirects
 * through LINE's standard web login -- the same code path works both ways,
 * matching the architecture doc's "LIFF is an entry wrapper, not a separate
 * app surface" framing. Email/password sign-in (`/sign-in`) remains fully
 * untouched as the other entry method.
 */
export default function LiffEntryPage() {
  const [state, setState] = useState<EntryState>({ phase: 'initializing' });

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
      if (!liffId) {
        if (!cancelled) setState({ phase: 'error', code: 'liff_not_configured' });
        return;
      }

      const liff = (await import('@line/liff')).default;

      try {
        await liff.init({ liffId });
      } catch {
        if (!cancelled) setState({ phase: 'error', code: 'liff_init_failed' });
        return;
      }

      if (!liff.isLoggedIn()) {
        if (!cancelled) setState({ phase: 'redirecting_to_line_login' });
        liff.login();
        return;
      }

      const idToken = liff.getIDToken();
      if (!idToken) {
        if (!cancelled) setState({ phase: 'error', code: 'missing_id_token' });
        return;
      }

      if (!cancelled) setState({ phase: 'exchanging' });
      const outcome = await exchangeLiffIdToken(idToken);
      if (cancelled) return;

      if (outcome.status === 'error') {
        setState({ phase: 'error', code: outcome.code });
        return;
      }

      window.location.href = `${LIFF_CALLBACK_PATH}?token_hash=${encodeURIComponent(outcome.tokenHash)}&type=${outcome.type}`;
    }

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main style={pageStyle(420)}>
      <h1>LINEでログイン</h1>
      {state.phase === 'error' ? (
        <p role="alert" style={alertDanger}>
          {describeError(state.code)}
        </p>
      ) : (
        <p style={mutedText}>{describeProgress(state.phase)}</p>
      )}
    </main>
  );
}

function describeProgress(phase: Exclude<EntryState, { phase: 'error' }>['phase']): string {
  switch (phase) {
    case 'initializing':
      return '読み込み中...';
    case 'redirecting_to_line_login':
      return 'LINEログインへ移動しています...';
    case 'exchanging':
      return 'ログイン処理中...';
  }
}

/** Deliberately generic, user-facing copy -- never surfaces the raw error code from the Edge Function. */
function describeError(code: string): string {
  if (code === 'not_linked' || code === 'employee_not_onboarded') {
    return 'このLINEアカウントはまだ連携されていません。担当マネージャーにご確認ください。';
  }
  return 'ログインに失敗しました。もう一度お試しいただくか、通常のログインページをご利用ください。';
}
