'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { demoColors } from '@/lib/demo/cafe/theme';
import { useLang } from '@/lib/demo/cafe/i18n';
import { PreviewLanguageToggle } from './preview-language-toggle';
import { PreviewLogoutButton } from './preview-logout-button';
import { PREVIEW_BASE_PATH } from './constants';

/** Canonical preview path for each menu page, used as the sign-out `returnTo` (FA-01) so logging out from Recipes/Staff signs back in to the same page. */
const RETURN_TO_BY_CURRENT: Record<'staff' | 'recipes' | 'manager', string> = {
  staff: PREVIEW_BASE_PATH,
  recipes: `${PREVIEW_BASE_PATH}/recipes`,
  manager: `${PREVIEW_BASE_PATH}/manager`,
};

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
          border: `1px solid ${open ? demoColors.accent : demoColors.border}`,
          background: open ? demoColors.accent : demoColors.surface,
          display: 'grid',
          placeItems: 'center',
          cursor: 'pointer',
          boxShadow: '0 5px 16px rgba(54,43,31,.08)',
          transition: 'background 200ms ease, border-color 200ms ease',
        }}
      >
        <span style={{ position: 'relative', width: 20, height: 16 }}>
          {[0, 1, 2].map((index) => (
            <span key={index} style={{
              position: 'absolute', left: 0, width: 20, height: 2, borderRadius: 2,
              background: open ? '#FFFFFF' : demoColors.textPrimary,
              top: index * 7,
              transition: 'transform 220ms cubic-bezier(.4,0,.2,1), opacity 160ms ease, top 220ms cubic-bezier(.4,0,.2,1), background 200ms ease',
              ...(open && index === 0 ? { top: 7, transform: 'rotate(45deg)' } : {}),
              ...(open && index === 1 ? { opacity: 0, transform: 'scale(0)' } : {}),
              ...(open && index === 2 ? { top: 7, transform: 'rotate(-45deg)' } : {}),
            }} />
          ))}
        </span>
      </button>
      <div
        aria-hidden={!open}
        role="dialog"
        aria-modal="true"
        style={{
          position: 'fixed', inset: 0, zIndex: 41,
          background: `linear-gradient(165deg, ${demoColors.accentStrong}, ${demoColors.accent})`,
          overflowY: 'auto',
          transform: open ? 'translateY(0)' : 'translateY(-100%)',
          transition: 'transform 360ms cubic-bezier(.16,1,.3,1)',
          pointerEvents: open ? 'auto' : 'none',
        }}
      >
        <div style={{ maxWidth: 420, margin: '0 auto', padding: '92px 20px 40px', display: 'grid', gap: 8 }}>
          <div
            style={{
              padding: '2px 2px 14px',
              opacity: open ? 1 : 0,
              transform: open ? 'translateY(0)' : 'translateY(8px)',
              transition: 'opacity 320ms ease 120ms, transform 320ms ease 120ms',
            }}
          >
            <strong style={{ display: 'block', fontSize: 20, color: '#FFFFFF' }}>{lang === 'ja' ? 'ナビゲーション' : 'Navigation'}</strong>
            <span style={{ color: 'rgba(255,255,255,.72)', fontSize: 13 }}>{lang === 'ja' ? '移動先を選択' : 'Choose a destination'}</span>
          </div>
          <MenuLink
            href="/mame-to-cha"
            icon="▦"
            label={lang === 'ja' ? 'スタッフ' : 'Staff'}
            description={lang === 'ja' ? '勤務・シフト・在庫' : 'Work, shifts and inventory'}
            active={current === 'staff'}
            open={open}
            delayMs={160}
          />
          <MenuLink
            href="/mame-to-cha/recipes"
            icon="◫"
            label={lang === 'ja' ? 'レシピ' : 'Recipes'}
            description={lang === 'ja' ? 'レシピと手順書' : 'Recipes and manuals'}
            active={current === 'recipes'}
            open={open}
            delayMs={200}
          />
          <div
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
              marginTop: 14, padding: '12px 14px', borderRadius: 14, background: 'rgba(255,255,255,.12)',
              opacity: open ? 1 : 0, transform: open ? 'translateY(0)' : 'translateY(10px)',
              transition: 'opacity 320ms ease 240ms, transform 320ms ease 240ms',
            }}
          >
            <span style={{ color: 'rgba(255,255,255,.85)', fontSize: 13, fontWeight: 700 }}>{lang === 'ja' ? '言語' : 'Language'}</span>
            <PreviewLanguageToggle variant="dark" />
          </div>
          <div
            style={{
              marginTop: 6, padding: '10px 14px', borderRadius: 14, background: 'rgba(255,255,255,.12)',
              opacity: open ? 1 : 0, transform: open ? 'translateY(0)' : 'translateY(10px)',
              transition: 'opacity 320ms ease 280ms, transform 320ms ease 280ms',
            }}
          >
            <PreviewLogoutButton returnTo={RETURN_TO_BY_CURRENT[current]} />
          </div>
        </div>
      </div>
    </div>
  );
}

function MenuLink({
  href,
  icon,
  label,
  description,
  active,
  open,
  delayMs,
}: {
  href: string;
  icon: string;
  label: string;
  description: string;
  active: boolean;
  open: boolean;
  delayMs: number;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      style={{
        display: 'grid',
        gridTemplateColumns: '42px 1fr auto',
        alignItems: 'center',
        gap: 12,
        padding: '13px 14px',
        borderRadius: 14,
        color: '#FFFFFF',
        textDecoration: 'none',
        background: active ? 'rgba(255,255,255,.22)' : 'rgba(255,255,255,.08)',
        border: `1px solid ${active ? 'rgba(255,255,255,.5)' : 'rgba(255,255,255,.14)'}`,
        opacity: open ? 1 : 0,
        transform: open ? 'translateY(0)' : 'translateY(10px)',
        transition: `opacity 320ms ease ${delayMs}ms, transform 320ms ease ${delayMs}ms, background 160ms ease`,
      }}
    >
      <span aria-hidden style={{ width: 42, height: 42, display: 'grid', placeItems: 'center', borderRadius: 12, background: active ? '#FFFFFF' : 'rgba(255,255,255,.16)', color: active ? demoColors.accentStrong : '#FFFFFF', fontSize: 19 }}>{icon}</span>
      <span><strong style={{ display: 'block', fontSize: 15.5 }}>{label}</strong><span style={{ display: 'block', marginTop: 1, color: 'rgba(255,255,255,.72)', fontSize: 12.5 }}>{description}</span></span>
      <span aria-hidden style={{ color: 'rgba(255,255,255,.7)' }}>›</span>
    </Link>
  );
}
