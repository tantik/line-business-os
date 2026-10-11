'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { LangProvider, useLang } from '@/lib/demo/cafe/i18n';
import { LangToggle } from '@/components/demo/cafe/LangToggle';
import { tAuth, type AuthCopyKey } from '@/lib/auth/auth-copy';
import { backLink, buttonPrimary, card, colors, mutedText, pageStyle } from '@/lib/ui/theme';

/** Translator bound to the surrounding `AuthShell` language. */
export function useAuthT(): (key: AuthCopyKey) => string {
  const { lang } = useLang();
  return (key) => tAuth(lang, key);
}

function ShellBody({ title, lead, children }: { title?: AuthCopyKey; lead?: AuthCopyKey; children?: ReactNode }) {
  const t = useAuthT();
  return (
    <main style={pageStyle(440)}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 24 }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '0.08em', color: colors.textPrimary }}>ORUWA</div>
          <div style={{ ...mutedText, fontSize: 12 }}>{t('brandTagline')}</div>
        </div>
        <div role="group" aria-label={t('langLabel')}>
          <LangToggle />
        </div>
      </header>
      <section style={{ ...card, padding: 24 }}>
        {title ? <h1 style={{ fontSize: 20, marginTop: 0 }}>{t(title)}</h1> : null}
        {lead ? <p style={{ ...mutedText, marginTop: 0 }}>{t(lead)}</p> : null}
        {children}
      </section>
    </main>
  );
}

/**
 * Shared frame for signed-out account screens and app-wide state pages:
 * ORUWA brand, JA/EN toggle (same `localStorage` choice as the dashboards),
 * one card. JA renders first; a stored EN choice applies after hydration.
 */
export function AuthShell(props: { title?: AuthCopyKey; lead?: AuthCopyKey; children?: ReactNode }) {
  return (
    <LangProvider>
      <ShellBody {...props} />
    </LangProvider>
  );
}

/** Translated navigation link: underlined text, or a full-width primary button. */
export function AuthLink({ href, k, asButton = false }: { href: string; k: AuthCopyKey; asButton?: boolean }) {
  const t = useAuthT();
  const style = asButton
    ? { ...buttonPrimary, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', width: '100%', boxSizing: 'border-box' as const }
    : backLink;
  return (
    <Link href={href} style={style}>
      {t(k)}
    </Link>
  );
}

/** A single translated paragraph, for server pages that only need static copy inside `AuthShell`. */
export function AuthText({ k, muted = true }: { k: AuthCopyKey; muted?: boolean }) {
  const t = useAuthT();
  return <p style={muted ? mutedText : undefined}>{t(k)}</p>;
}
