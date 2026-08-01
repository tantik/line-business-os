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
        aria-label={open ? (lang === 'ja' ? '閉じる' : 'Close') : lang === 'ja' ? 'メニュー' : 'Menu'}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        style={{
          position: 'relative',
          zIndex: 42,
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
        onClick={() => setOpen(false)}
        style={{
          position: 'fixed', inset: 0, zIndex: 40,
          background: 'rgba(54,43,31,.32)',
          opacity: open ? 1 : 0,
          transition: 'opacity 160ms ease',
          pointerEvents: open ? 'auto' : 'none',
        }}
      />
      <div
        aria-hidden={!open}
        style={{
          position: 'fixed', right: 4, top: 66, left: 4, zIndex: 41,
          maxHeight: 'calc(100vh - 82px)', overflowY: 'auto',
          borderRadius: 18, border: `1px solid ${demoColors.border}`,
          background: 'rgba(255,255,255,.98)', boxShadow: '0 22px 60px rgba(54,43,31,.22)',
          backdropFilter: 'blur(14px)',
          opacity: open ? 1 : 0, transform: open ? 'translateY(0) scale(1)' : 'translateY(-6px) scale(.97)',
          transformOrigin: 'top right', transition: 'opacity 160ms ease, transform 180ms ease',
          pointerEvents: open ? 'auto' : 'none',
        }}
      >
        <div style={{ display: 'grid', gap: 6, padding: 12 }}>
          <div style={{
            position: 'sticky', top: -12, zIndex: 1,
            padding: '3px 6px 7px', margin: '-12px -12px 0', background: 'inherit',
          }}>
            <strong style={{ display: 'block', fontSize: 14 }}>{lang === 'ja' ? 'ナビゲーション' : 'Navigation'}</strong>
            <span style={{ color: demoColors.textMuted, fontSize: 11.5 }}>{lang === 'ja' ? '移動先を選択' : 'Choose a destination'}</span>
          </div>
          <MenuLink href="/mame-to-cha" icon="▦" label={lang === 'ja' ? 'スタッフ' : 'Staff'} description={lang === 'ja' ? '勤務・シフト・在庫' : 'Work, shifts and inventory'} active={current === 'staff'} />
          <MenuLink href="/mame-to-cha/recipes" icon="◫" label={lang === 'ja' ? 'レシピ' : 'Recipes'} description={lang === 'ja' ? 'レシピと手順書' : 'Recipes and manuals'} active={current === 'recipes'} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderTop: `1px solid ${demoColors.border}`, padding: '10px 6px 2px', marginTop: 4 }}>
            <span style={{ color: demoColors.textMuted, fontSize: 12 }}>{lang === 'ja' ? '言語' : 'Language'}</span><PreviewLanguageToggle />
          </div>
          <div style={{ padding: '6px 6px 2px' }}><PreviewLogoutButton /></div>
        </div>
      </div>
    </div>
  );
}

function MenuLink({ href, icon, label, description, active }: { href: string; icon: string; label: string; description: string; active: boolean }) {
  return <Link href={href} aria-current={active ? 'page' : undefined} style={{ display: 'grid', gridTemplateColumns: '34px 1fr auto', alignItems: 'center', gap: 10, padding: '10px 11px', borderRadius: 12, color: demoColors.textPrimary, textDecoration: 'none', background: active ? demoColors.accentMuted : 'transparent', border: `1px solid ${active ? demoColors.accent : 'transparent'}` }}>
    <span aria-hidden style={{ width: 34, height: 34, display: 'grid', placeItems: 'center', borderRadius: 10, background: active ? demoColors.accent : demoColors.surfaceElevated, color: active ? '#fff' : demoColors.textPrimary, fontSize: 17 }}>{icon}</span>
    <span><strong style={{ display: 'block', fontSize: 13.5 }}>{label}</strong><span style={{ display: 'block', marginTop: 1, color: demoColors.textMuted, fontSize: 11.5 }}>{description}</span></span>
    <span aria-hidden style={{ color: demoColors.textMuted }}>›</span>
  </Link>;
}
