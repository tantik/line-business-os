import * as React from 'react';
import {
  color,
  radius,
  space,
  fontSize,
  fontWeight,
  control,
  duration,
  easing,
} from '@line-os/tokens';
import { cn } from './cn.js';

type Variant = 'primary' | 'secondary' | 'ghost';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

/**
 * Phase 0 interim: this package previously used Tailwind utility classes
 * (`bg-emerald-700` …), but `apps/web` has no Tailwind pipeline and the palette
 * did not match the product's warm theme, so the classes were dead and
 * misleading. Styles now come from `@line-os/tokens`. A proper variant system
 * (cva + Tailwind) lands in Phase 1 when this package becomes the real
 * component library — see `docs/design/charter.md`.
 */
const base: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: control['height-lg'],
  padding: `${space[2]} ${space[4]}`,
  borderRadius: radius.md,
  fontSize: fontSize.base,
  fontWeight: Number(fontWeight.semibold),
  lineHeight: 1.35,
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  transition: `filter ${duration.base} ${easing.standard}, background-color ${duration.base} ${easing.standard}`,
};

const variants: Record<Variant, React.CSSProperties> = {
  primary: { background: color.accent, color: color['text-on-accent'], border: 'none' },
  secondary: {
    background: color.surface,
    color: color['text-primary'],
    border: `1px solid ${color.border}`,
  },
  ghost: { background: 'transparent', color: color['text-primary'], border: 'none' },
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', className, style, ...props }, ref) => (
    <button
      ref={ref}
      className={cn('oruwa-button', className)}
      style={{ ...base, ...variants[variant], ...style }}
      {...props}
    />
  ),
);
Button.displayName = 'Button';
