'use client';

import { demoColors } from '@/lib/demo/cafe/theme';
import { useLang } from '@/lib/demo/cafe/i18n';

/**
 * Language switch for the DB-backed preview shell.
 *
 * Previously this held its own local `useState('ja')`: clicking a button
 * only re-highlighted itself and had zero effect on any surrounding text,
 * because no shared language state existed for it to change and no preview
 * component ever read one. That was the root cause of "switching language
 * does not translate the UI" -- not a per-string bug, an architecture gap
 * (this toggle was never wired to the existing `LangProvider`/`useLang()`
 * mechanism already used by the demo Staff/Recipes screens). Fixed by
 * consuming the same shared `useLang()` context that `apps/_client-preview/
 * mame-to-cha/page.tsx` and `.../manager/page.tsx` now mount a `LangProvider`
 * for -- every component under that provider (this toggle, and any preview
 * component that calls `useLang()`) now shares one persisted `lang` value
 * instead of each button/component guessing its own.
 */
export function PreviewLanguageToggle({ variant = 'light', fullWidth = false }: { variant?: 'light' | 'dark'; fullWidth?: boolean }) {
  const { lang, setLang } = useLang();
  const inactiveColor = variant === 'dark' ? 'rgba(255,255,255,.72)' : demoColors.textMuted;
  const borderColor = variant === 'dark' ? 'rgba(255,255,255,.4)' : demoColors.border;
  return (
    <div
      aria-label="Language"
      style={{
        display: fullWidth ? 'flex' : 'inline-flex',
        width: fullWidth ? '100%' : undefined,
        border: `1px solid ${borderColor}`,
        borderRadius: 999,
        overflow: 'hidden',
      }}
    >
      {(['ja', 'en'] as const).map((value) => (
        <button key={value} type="button" aria-pressed={lang === value} onClick={() => setLang(value)}
          style={{
            border: 0,
            minHeight: 44,
            minWidth: 44,
            flex: fullWidth ? 1 : undefined,
            padding: '7px 12px',
            background: lang === value ? demoColors.accent : 'transparent',
            color: lang === value ? '#fff' : inactiveColor,
            fontWeight: 700,
            cursor: 'pointer',
          }}>
          {value.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
