'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { LangProvider, useLang } from '@/lib/demo/cafe/i18n';
import { tAuth, type AuthCopyKey } from '@/lib/auth/auth-copy';
import { backLink, mutedText, pageStyle } from '@/lib/ui/theme';

/**
 * Minimal, reusable "safe state" components for authenticated/tenant-aware
 * routes. They present consistent loading / error / unauthorized /
 * no-membership / missing-config UI in JA (default) or EN (the viewer's
 * stored dashboard language) and never expose internal error details.
 */

function StateBody({ title, body, children, homeLink }: { title: AuthCopyKey; body?: AuthCopyKey; children?: ReactNode; homeLink?: boolean }) {
  const { lang } = useLang();
  return (
    <main style={pageStyle(720)}>
      <h1>{tAuth(lang, title)}</h1>
      {body ? <p style={mutedText}>{tAuth(lang, body)}</p> : null}
      {children}
      {homeLink ? (
        <Link href="/" style={backLink}>
          {tAuth(lang, 'goHome')}
        </Link>
      ) : null}
    </main>
  );
}

function StateShell(props: { title: AuthCopyKey; body?: AuthCopyKey; children?: ReactNode; homeLink?: boolean }) {
  return (
    <LangProvider>
      <StateBody {...props} />
    </LangProvider>
  );
}

export function LoadingState() {
  return <StateShell title="loadingTitle" body="loadingBody" />;
}

export function ErrorState({ message }: { message?: string }) {
  // Intentionally generic: do not surface raw internal error text to users.
  return (
    <StateShell title="errorTitle" body={message ? undefined : 'errorBody'}>
      {message ? <p style={mutedText}>{message}</p> : null}
    </StateShell>
  );
}

export function UnauthorizedState() {
  // '/' routes a signed-in user to their own workspace -- never a dead end.
  return <StateShell title="accessDeniedTitle" body="accessDeniedBody" homeLink />;
}

export function NoTenantState() {
  return <StateShell title="noTenantTitle" body="noTenantBody" />;
}

export function MissingConfigState() {
  // Operator-facing (deployment misconfiguration), so the detail stays technical.
  return (
    <StateShell title="configTitle">
      <p style={mutedText}>
        The application is missing required Supabase configuration. Set{' '}
        <code>NEXT_PUBLIC_SUPABASE_URL</code> and{' '}
        <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> (an{' '}
        <code>sb_publishable_*</code> value; see <code>.env.example</code>).
      </p>
    </StateShell>
  );
}

export function NotFoundState() {
  return <StateShell title="itemNotFoundTitle" body="itemNotFoundBody" homeLink />;
}

export function ModuleUnavailableState() {
  return <StateShell title="moduleUnavailableTitle" body="moduleUnavailableBody" homeLink />;
}
