'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BrandBadge } from './brand-badge';
import { PreviewLanguageToggle } from '@/lib/preview/preview-language-toggle';
import { SignOutButton } from '@/components/sign-out-button';
import { colors, mutedText } from '@/lib/ui/theme';
import hoverStyles from '@/lib/ui/theme.module.css';

export interface AccountMenuProps {
  displayName: string;
  positionLabel: string;
  signOutLabel: string;
}

/**
 * Header account trigger (avatar + name + chevron) + dropdown, shared by
 * both Manager and Staff, replacing the always-visible language-toggle/
 * sign-out pair that used to sit directly in each header (Founder header
 * redesign, 2026-08-24): identity moves to a standard top-right account
 * area; language and sign-out become secondary actions inside its panel,
 * alongside the caller's own name/position. Neither dashboard has a
 * personalized page title any more -- each header's left side is now the
 * tenant/location, matching the multi-location mockup.
 *
 * Same portal/outside-click/Escape-key mechanics as `ActionsMenu`
 * (`@/components/shared/design-kit`), duplicated rather than reused because
 * that component's panel is a flat list of clickable text items and this
 * one's content (a name/position block, a two-button language toggle, a
 * sign-out form) doesn't fit that shape.
 */
export function AccountMenu({ displayName, positionLabel, signOutLabel }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  function openMenu() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setCoords({ top: rect.bottom + 6, right: Math.max(8, window.innerWidth - rect.right) });
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    function handleScrollOrResize() {
      setOpen(false);
    }
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={displayName}
        className={hoverStyles.buttonSecondary}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          minHeight: 40,
          padding: '4px 10px 4px 4px',
          borderRadius: 999,
          border: `1px solid ${colors.border}`,
          background: colors.surface,
          cursor: 'pointer',
          flexShrink: 0,
        }}
        onClick={() => (open ? setOpen(false) : openMenu())}
      >
        <BrandBadge label={displayName} size={28} />
        <span
          style={{
            maxWidth: 120,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontSize: 13,
            fontWeight: 600,
            color: colors.textPrimary,
          }}
        >
          {displayName}
        </span>
        <span aria-hidden="true" style={{ fontSize: 10, color: colors.textMuted }}>
          ▾
        </span>
      </button>
      {open && coords
        ? createPortal(
            <div
              ref={panelRef}
              role="menu"
              aria-label={displayName}
              style={{
                position: 'fixed',
                top: coords.top,
                right: coords.right,
                minWidth: 220,
                background: colors.surface,
                border: `1px solid ${colors.border}`,
                borderRadius: 10,
                boxShadow: '0 8px 24px rgba(54, 43, 31, 0.18)',
                padding: 12,
                zIndex: 1200,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <div>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: colors.textPrimary }}>{displayName}</p>
                <p style={{ margin: '2px 0 0', fontSize: 13, ...mutedText }}>{positionLabel}</p>
              </div>
              <PreviewLanguageToggle fullWidth />
              <div style={{ borderTop: `1px solid ${colors.border}` }} />
              <SignOutButton label={signOutLabel} fullWidth />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
