'use client';

import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
import { BrandLoader } from './BrandLoader';

/**
 * Platform-standard action button: disables itself and swaps its label for
 * `BrandLoader` + an optional message the instant `pending` is true, so a
 * second click can never re-fire the same Server Action while the first is
 * still in flight. Every Add/Edit/Delete/Publish/Approve/Clock-in-out/etc.
 * button across every module should render through this component instead
 * of hand-rolling its own `disabled={isPending} ? label : 'Saving...'`
 * ternary.
 *
 * Takes the caller's own themed `style`/`pendingStyle` (e.g. this app's
 * `buttonPrimary`/`buttonDisabled`) rather than owning any button visual
 * itself -- colors always come from the caller's theme, never hardcoded
 * here, so this one component works unchanged in the Cafe demo's light
 * theme, the dashboard's dark theme, or any future module's theme.
 */
export function LoadingButton({
  pending,
  pendingLabel,
  children,
  style,
  pendingStyle,
  type = 'button',
  onClick,
  ...rest
}: {
  pending: boolean;
  /** Shown next to the loader while pending, e.g. "Saving...", "Deleting...". Falls back to `children` if omitted. */
  pendingLabel?: ReactNode;
  children: ReactNode;
  style: CSSProperties;
  /** Style applied while pending (e.g. this app's `buttonDisabled`). Falls back to `style`. */
  pendingStyle?: CSSProperties;
  type?: 'button' | 'submit';
  onClick?: () => void;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'style' | 'onClick' | 'type' | 'children' | 'disabled'>) {
  return (
    <button type={type} style={pending ? (pendingStyle ?? style) : style} disabled={pending} onClick={onClick} {...rest}>
      {pending ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <BrandLoader size="xs" label={typeof pendingLabel === 'string' ? pendingLabel : 'Loading'} />
          {pendingLabel ?? children}
        </span>
      ) : (
        children
      )}
    </button>
  );
}
