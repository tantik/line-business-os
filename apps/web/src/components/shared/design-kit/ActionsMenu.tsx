'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { colors } from '@/lib/ui/theme';
import hoverStyles from '@/lib/ui/theme.module.css';

export interface ActionsMenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}

export interface ActionsMenuProps {
  /** Aria-label for the trigger button, e.g. "More actions for {item name}". */
  triggerLabel: string;
  items: ActionsMenuItem[];
}

const triggerStyle = {
  width: 36,
  height: 36,
  borderRadius: 8,
  border: `1px solid ${colors.border}`,
  background: colors.surface,
  color: colors.textPrimary,
  fontSize: 16,
  lineHeight: 1,
  cursor: 'pointer',
  flexShrink: 0,
} as const;

/**
 * Shared "rare/dangerous actions" contextual menu (ORUWA design system
 * charter, 2026-08-21: keep infrequent/destructive actions out of the
 * always-visible row and behind a `•••` trigger instead). Renders its panel
 * through a portal positioned with `getBoundingClientRect`, not inline
 * `position: absolute` next to the trigger -- every current call site lives
 * inside a `Modal` whose body scrolls with `overflow-y: auto`, which would
 * silently clip an inline-positioned dropdown near the bottom edge.
 */
export function ActionsMenu({ triggerLabel, items }: ActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  function openMenu() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setCoords({ top: rect.bottom + 4, left: Math.max(8, rect.right - 200) });
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
        aria-label={triggerLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        className={hoverStyles.iconButton}
        style={triggerStyle}
        onClick={() => (open ? setOpen(false) : openMenu())}
      >
        •••
      </button>
      {open && coords
        ? createPortal(
            <div
              ref={panelRef}
              role="menu"
              aria-label={triggerLabel}
              style={{
                position: 'fixed',
                top: coords.top,
                left: coords.left,
                minWidth: 200,
                background: colors.surface,
                border: `1px solid ${colors.border}`,
                borderRadius: 8,
                boxShadow: '0 8px 24px rgba(54, 43, 31, 0.18)',
                padding: 4,
                zIndex: 1200,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {items.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  className={hoverStyles.menuItem}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '10px 12px',
                    borderRadius: 6,
                    border: 'none',
                    background: 'transparent',
                    color: item.danger ? colors.dangerText : colors.textPrimary,
                    fontSize: 14,
                    fontWeight: 500,
                    cursor: item.disabled ? 'not-allowed' : 'pointer',
                    opacity: item.disabled ? 0.5 : 1,
                  }}
                  onClick={() => {
                    setOpen(false);
                    item.onClick();
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
