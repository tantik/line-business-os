'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal, useFormStatus } from 'react-dom';
import { BrandBadge } from './brand-badge';
import { PreviewLanguageToggle } from '@/lib/preview/preview-language-toggle';
import { SignOutButton } from '@/components/sign-out-button';
import Link from 'next/link';
import { useLang } from '@/lib/demo/cafe/i18n';
import { tAuth } from '@/lib/auth/auth-copy';
import { buttonSecondary, colors, mutedText } from '@/lib/ui/theme';
import hoverStyles from '@/lib/ui/theme.module.css';
import { usePathname } from 'next/navigation';
import { setActiveTenant } from '@/lib/tenant/actions';
import { setActiveLocation } from '@/lib/tenant/location-actions';
import { TENANT_SELECT_FIELD } from '@/lib/tenant/selection';
import type { TenantSwitchOption } from '@/lib/tenant/switch-options';

export type { TenantSwitchOption };

export interface AccountMenuProps {
  displayName: string;
  positionLabel: string;
  signOutLabel: string;
  /** Every cafe the caller belongs to (F13); the switcher shows only with two or more. */
  tenantOptions?: TenantSwitchOption[];
  activeTenantId?: string;
  /** The caller's active stores in this cafe (DEBT-139 L2); the switcher shows only with two or more. */
  locationOptions?: LocationSwitchOption[];
  activeLocationId?: string;
}

export interface LocationSwitchOption {
  locationId: string;
  locationName: string;
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
export function AccountMenu({
  displayName,
  positionLabel,
  signOutLabel,
  tenantOptions = [],
  activeTenantId,
  locationOptions = [],
  activeLocationId,
}: AccountMenuProps) {
  const { lang } = useLang();
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
    function handleScrollOrResize(event: Event) {
      // DEBT-120 (b): scrolling INSIDE the panel (many cafes / stores on a
      // short phone) must not close it; scrolling the page still does.
      if (event.type === 'scroll' && event.target instanceof Node && panelRef.current?.contains(event.target)) return;
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
        aria-haspopup="dialog"
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
            <>
              {/* Semi-transparent scrim behind the dropdown, matching the shared `Modal`'s own overlay color -- purely visual (the
                  outside-click listener above already closes the menu on any pointerdown here), but makes an open account menu
                  read clearly as a layer above the page instead of floating over it unclearly (Founder polish request, 2026-08-24). */}
              <div aria-hidden="true" style={{ position: 'fixed', inset: 0, background: 'rgba(54, 43, 31, 0.45)', zIndex: 1199 }} />
              <div
                ref={panelRef}
                // DEBT-120 (a): a panel of groups, buttons, a link and a form
                // is a dialog, not a `menu` (no menuitems / arrow-key model).
                role="dialog"
                aria-label={displayName}
                style={{
                  position: 'fixed',
                  top: coords.top,
                  right: coords.right,
                  minWidth: 220,
                  maxWidth: `calc(100vw - ${coords.right + 8}px)`,
                  // vh, not dvh: iOS Safari < 15.4 ignores dvh (no cap at all).
                  maxHeight: `calc(100vh - ${coords.top + 8}px)`,
                  overflowY: 'auto',
                  overscrollBehavior: 'contain',
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
                {tenantOptions.length > 1 ? (
                  <TenantSwitchList options={tenantOptions} activeTenantId={activeTenantId} heading={tAuth(lang, 'tenantSwitchHeading')} />
                ) : null}
                {locationOptions.length > 1 ? (
                  <LocationSwitchList
                    options={locationOptions}
                    activeLocationId={activeLocationId}
                    heading={tAuth(lang, 'locationSwitchHeading')}
                  />
                ) : null}
                <PreviewLanguageToggle fullWidth />
                <Link
                  href="/account"
                  className={hoverStyles.buttonSecondary}
                  style={{ ...buttonSecondary, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}
                  onClick={() => setOpen(false)}
                >
                  {tAuth(lang, 'accountMenuLink')}
                </Link>
                <div style={{ borderTop: `1px solid ${colors.border}` }} />
                <SignOutButton label={signOutLabel} fullWidth />
              </div>
            </>,
            document.body,
          )
        : null}
    </>
  );
}

/**
 * Cafe switcher (F13): one form posting to `setActiveTenant` -- each cafe is
 * a submit button carrying its id as the submitter value -- which
 * revalidates the id against live memberships, writes the active-tenant
 * cookie and lands on the caller's own workspace in that cafe. The current
 * cafe is marked `aria-current` and does not submit; while a switch is in
 * flight every entry is locked so a second click cannot race the first.
 */
function TenantSwitchList({ options, activeTenantId, heading }: { options: TenantSwitchOption[]; activeTenantId?: string; heading: string }) {
  return (
    <form action={setActiveTenant} role="group" aria-label={heading} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <p style={{ margin: 0, fontSize: 12, fontWeight: 600, ...mutedText }}>{heading}</p>
      <SwitchButtons
        field={TENANT_SELECT_FIELD}
        options={options.map((o) => ({ id: o.tenantId, label: o.tenantName }))}
        activeId={activeTenantId}
      />
      <div style={{ borderTop: `1px solid ${colors.border}`, marginTop: 4 }} />
    </form>
  );
}

/**
 * Store switcher (DEBT-139 L2): same form pattern as the cafe switcher,
 * posting to `setActiveLocation`, which re-checks the id against the
 * caller's live `api.my_locations` rows before writing the `oruwa_location`
 * cookie, then returns to the current workspace page (`returnTo`, reduced
 * server-side to an allow-listed path).
 */
function LocationSwitchList({ options, activeLocationId, heading }: { options: LocationSwitchOption[]; activeLocationId?: string; heading: string }) {
  const pathname = usePathname();
  return (
    <form action={setActiveLocation} role="group" aria-label={heading} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <p style={{ margin: 0, fontSize: 12, fontWeight: 600, ...mutedText }}>{heading}</p>
      <input type="hidden" name="returnTo" value={pathname ?? '/dashboard'} />
      <SwitchButtons
        field="locationId"
        options={options.map((o) => ({ id: o.locationId, label: o.locationName }))}
        activeId={activeLocationId}
      />
      <div style={{ borderTop: `1px solid ${colors.border}`, marginTop: 4 }} />
    </form>
  );
}

function SwitchButtons({ field, options, activeId }: { field: string; options: { id: string; label: string }[]; activeId?: string }) {
  const { pending, data } = useFormStatus();
  const pendingId = pending ? data?.get(field) : null;
  return (
    <>
      {options.map((option) => {
        const isActive = option.id === activeId;
        const isPendingTarget = pendingId === option.id;
        const isLocked = isActive || pending;
        return (
          <button
            key={option.id}
            type={isActive ? 'button' : 'submit'}
            name={isActive ? undefined : field}
            value={isActive ? undefined : option.id}
            aria-current={isActive ? 'true' : undefined}
            aria-disabled={isLocked || undefined}
            aria-busy={isPendingTarget || undefined}
            onClick={(event) => {
              if (pending) event.preventDefault();
            }}
            className={isLocked ? undefined : hoverStyles.buttonSecondary}
            style={{
              width: '100%',
              minHeight: 44,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 12px',
              textAlign: 'left',
              fontSize: 14,
              fontWeight: isActive ? 700 : 500,
              color: colors.textPrimary,
              background: isActive ? colors.accentMuted : colors.surface,
              border: `1px solid ${isActive ? colors.accent : colors.border}`,
              borderRadius: 8,
              cursor: isActive ? 'default' : pending ? 'progress' : 'pointer',
              opacity: pending && !isActive && !isPendingTarget ? 0.6 : 1,
            }}
          >
            <span aria-hidden="true" style={{ width: 14, color: colors.accent }}>
              {isActive ? '✓' : isPendingTarget ? '…' : ''}
            </span>
            <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{option.label}</span>
          </button>
        );
      })}
    </>
  );
}
