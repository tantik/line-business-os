'use client';

import { useEffect } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';
import { LangProvider, useLang, type Lang } from '@/lib/demo/cafe/i18n';
import { tAuth, type AuthCopyKey } from '@/lib/auth/auth-copy';
import { backLink, buttonPrimary, card, colors, input, minTouchTarget, mutedText, pageStyle } from '@/lib/ui/theme';

/** Translator bound to the surrounding `AuthShell` language. */
export function useAuthT(): (key: AuthCopyKey) => string {
  const { lang } = useLang();
  return (key) => tAuth(lang, key);
}

/** 16px so iOS Safari does not zoom the page when a field gets focus. */
export const authInput: CSSProperties = { ...input, fontSize: 16 };

const LANGS: Lang[] = ['ja', 'en'];

/** JA/EN switch with full 44px touch targets (the dashboards' demo toggle is ~26px). */
function AuthLangToggle() {
  const { lang, setLang } = useLang();
  return (
    <div role="group" aria-label={tAuth(lang, 'langLabel')} style={{ display: 'inline-flex', border: `1px solid ${colors.border}`, borderRadius: 999, overflow: 'hidden', flexShrink: 0 }}>
      {LANGS.map((code) => (
        <button
          key={code}
          type="button"
          lang={code}
          onClick={() => setLang(code)}
          aria-pressed={lang === code}
          style={{
            minWidth: minTouchTarget,
            minHeight: minTouchTarget,
            padding: '0 12px',
            fontSize: 13,
            fontWeight: 700,
            border: 'none',
            cursor: 'pointer',
            background: lang === code ? colors.accent : 'transparent',
            color: lang === code ? '#FFFFFF' : colors.textMuted,
          }}
        >
          {code.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

function ShellBody({ title, lead, children }: { title?: AuthCopyKey; lead?: AuthCopyKey; children?: ReactNode }) {
  const t = useAuthT();
  const { lang } = useLang();
  // Screen readers pick the voice from <html lang>; keep it in step with the toggle.
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  return (
    <main style={pageStyle(440)}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 24 }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '0.08em', color: colors.textPrimary }}>ORUWA</div>
          <div style={{ ...mutedText, fontSize: 12 }}>{t('brandTagline')}</div>
        </div>
        <AuthLangToggle />
      </header>
      <section style={{ ...card, padding: 24 }}>
        {title ? <h1 style={{ fontSize: 20, marginTop: 0 }}>{t(title)}</h1> : null}
        {lead ? <p style={{ ...mutedText, marginTop: 0, marginBottom: 16 }}>{t(lead)}</p> : null}
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
