'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { demoColors } from '@/lib/demo/cafe/theme';
import { useLang } from '@/lib/demo/cafe/i18n';
import { PreviewLanguageToggle } from './preview-language-toggle';
import { PreviewLogoutButton } from './preview-logout-button';

export function PreviewCafeMenu({ current }: { current: 'staff' | 'recipes' | 'manager' }) {
  const { lang } = useLang();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  return (
    <div ref={rootRef} style={{ position: 'relative', zIndex: 30 }}>
      <button
        type="button"
        aria-label={lang === 'ja' ? 'メニュー' : 'Menu'}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        style={{
          width: 42,
          height: 42,
          borderRadius: 12,
          border: `1px solid ${demoColors.border}`,
          background: demoColors.surface,
          display: 'grid',
          placeItems: 'center',
          cursor: 'pointer',
          boxShadow: '0 5px 16px rgba(54,43,31,.08)',
        }}
      >
        <span style={{ position: 'relative', width: 20, height: 16 }}>
          {[0, 1, 2].map((index) => (
            <span key={index} style={{
              position: 'absolute', left: 0, width: 20, height: 2, borderRadius: 2,
              background: demoColors.textPrimary,
              top: index * 7,
              transition: 'transform 180ms ease, opacity 140ms ease, top 180ms ease',
              ...(open && index === 0 ? { top: 7, transform: 'rotate(45deg)' } : {}),
              ...(open && index === 1 ? { opacity: 0 } : {}),
              ...(open && index === 2 ? { top: 7, transform: 'rotate(-45deg)' } : {}),
            }} />
          ))}
        </span>
      </button>
      <div
        aria-hidden={!open}
        style={{
          position: 'absolute', right: 0, top: 50, width: 210, padding: 10,
          borderRadius: 14, border: `1px solid ${demoColors.border}`,
          background: demoColors.surface, boxShadow: '0 16px 40px rgba(54,43,31,.18)',
          opacity: open ? 1 : 0, transform: open ? 'translateY(0) scale(1)' : 'translateY(-6px) scale(.97)',
          transformOrigin: 'top right', transition: 'opacity 160ms ease, transform 180ms ease',
          pointerEvents: open ? 'auto' : 'none',
        }}
      >
        <div style={{ display: 'grid', gap: 6 }}>
          {current !== 'staff' ? <MenuLink href="/mame-to-cha" label={lang === 'ja' ? 'スタッフ' : 'Staff'} /> : null}
          {current !== 'recipes' ? <MenuLink href="/mame-to-cha/recipes" label={lang === 'ja' ? 'レシピ' : 'Recipes'} /> : null}
          <div style={{ padding: '6px 4px 2px' }}><PreviewLanguageToggle /></div>
          <div style={{ borderTop: `1px solid ${demoColors.border}`, paddingTop: 8, marginTop: 2 }}><PreviewLogoutButton /></div>
        </div>
      </div>
    </div>
  );
}

function MenuLink({ href, label }: { href: string; label: string }) {
  return <Link href={href} style={{ padding: '10px 12px', borderRadius: 9, color: demoColors.textPrimary, textDecoration: 'none', fontWeight: 700 }}>{label}</Link>;
}

