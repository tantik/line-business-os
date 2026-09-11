import * as React from 'react';
import { cn } from './cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /**
   * `lg` (44px, default) meets the WCAG 2.5.5 tap target directly — use it
   * everywhere on Staff/mobile surfaces. `md` (40px) and `sm` (36px) are for
   * Manager desktop-dense contexts only (a table row's inline actions, a
   * toolbar) — never use them on a touch-primary surface.
   */
  size?: ButtonSize;
  /** Spinner + `aria-busy` + auto-disable. Button stays the same width (label kept, not replaced). */
  loading?: boolean;
  /** Icon-only button: square, `aria-label` becomes mandatory (enforced by prop type via `IconButtonProps`). */
  icon?: React.ReactNode;
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-10 px-4 text-base',
  lg: 'h-11 px-5 text-base',
};

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-text-on-accent border border-transparent hover:brightness-95 active:brightness-90 disabled:bg-accent',
  secondary:
    'bg-surface text-text-primary border border-border hover:bg-surface-elevated active:bg-surface-elevated',
  ghost: 'bg-transparent text-text-primary border border-transparent hover:bg-surface-elevated',
  destructive:
    'bg-surface text-danger-text border border-danger hover:bg-danger-muted active:bg-danger-muted',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'lg', loading = false, icon, className, children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      type={props.type ?? 'button'}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      className={cn(
        'oruwa-button inline-flex items-center justify-center gap-2 rounded-md font-semibold leading-tight whitespace-nowrap',
        'transition-[filter,background-color,box-shadow] duration-base ease-standard',
        /* Tailwind's default opacity-50 utility matches state.disabled (0.5) exactly. */
        'disabled:cursor-not-allowed disabled:opacity-50',
        sizeClasses[size],
        variantClasses[variant],
        className,
      )}
      {...props}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';

export interface IconButtonProps extends Omit<ButtonProps, 'icon' | 'children'> {
  icon: React.ReactNode;
  'aria-label': string;
}

const iconSizeClasses: Record<ButtonSize, string> = {
  sm: 'h-9 w-9',
  md: 'h-10 w-10',
  lg: 'h-11 w-11',
};

/**
 * Square icon-only button. Always renders at least a 44x44 (`lg`, default)
 * hit area even when the glyph inside is small — closes audit finding
 * (24-32px `?`/`×`/tab targets). `sm`/`md` are desktop-dense-only, same rule
 * as `Button`.
 */
export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ variant = 'ghost', size = 'lg', icon, className, ...props }, ref) => (
    <Button
      ref={ref}
      variant={variant}
      size={size}
      className={cn('oruwa-icon-button p-0', iconSizeClasses[size], className)}
      {...props}
    >
      {icon}
    </Button>
  ),
);
IconButton.displayName = 'IconButton';

function Spinner() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
