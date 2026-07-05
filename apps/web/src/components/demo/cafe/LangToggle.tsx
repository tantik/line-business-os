'use client';

import { useLang } from '@/lib/demo/cafe/i18n';
import { demoColors } from '@/lib/demo/cafe/theme';

const LANG_OPTIONS = ['ja', 'en'] as const;

/** Small JA/EN segmented toggle for the staff and recipes demo headers. Not shown on the manager dashboard. */
export function LangToggle() {
  const { lang, setLang } = useLang();

  return (
    <div
      style={{
        display: 'inline-flex',
        flexShrink: 0,
        border: `1px solid ${demoColors.border}`,
        borderRadius: 999,
        overflow: 'hidden',
      }}
    >
      {LANG_OPTIONS.map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => setLang(code)}
          aria-pressed={lang === code}
          style={{
            padding: '6px 12px',
            fontSize: 12,
            fontWeight: 700,
            border: 'none',
            cursor: 'pointer',
            background: lang === code ? demoColors.accent : 'transparent',
            color: lang === code ? '#FFFFFF' : demoColors.textMuted,
          }}
        >
          {code.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
