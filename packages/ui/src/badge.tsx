import * as React from 'react';
import { cn } from './cn';

/**
 * The Status / Metadata / Action model (mission §12, both audits' required
 * precondition #2 — "visually competing pills"). Five roles, deliberately
 * NOT all rendered as the same badge shape:
 *
 * - `StatusBadge` — STATUS/SEVERITY: a lifecycle state or risk level that
 *   needs interpretation or action (Overdue, Critical, Required). Pill,
 *   AA-safe tone, and for the three alert tones an icon IN ADDITION to
 *   color (audit: color alone is not an acceptable differentiator).
 * - `MetadataText` — METADATA: due time, category, location. Plain text,
 *   never a pill — competing with status pills is exactly what both audits
 *   flagged ("due-time and category are metadata, not status").
 * - `CountBadge` — COUNT: a small numeral summary (e.g. an unread count).
 * - `Tag` — TAG: user-authored classification, always neutral tone.
 * ACTION is a `Button`/`IconButton`, not a badge — never render an
 * actionable affordance as a pill.
 */

export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'critical' | 'muted';

const toneClasses: Record<StatusTone, string> = {
  neutral: 'bg-surface-elevated text-text-primary border-border',
  info: 'bg-info-muted text-info-text border-transparent',
  success: 'bg-success-muted text-success-text border-transparent',
  warning: 'bg-warning-muted text-warning-text border-transparent',
  critical: 'bg-danger-muted text-danger-text border-transparent',
  muted: 'bg-transparent text-text-muted border-border',
};

/** Icon (not just color) for the three tones the accessibility audit called out as alert-carrying. */
const toneIcon: Partial<Record<StatusTone, React.ReactNode>> = {
  success: <DotIcon />,
  warning: <TriangleIcon />,
  critical: <TriangleIcon />,
};

export interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: StatusTone;
  size?: 'sm' | 'md';
  /** Set false to suppress the tone icon for a purely decorative/neutral badge. Default true for success/warning/critical. */
  showIcon?: boolean;
}

export function StatusBadge({ tone = 'neutral', size = 'md', showIcon = true, className, children, ...props }: StatusBadgeProps) {
  const icon = showIcon ? toneIcon[tone] : undefined;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border font-medium',
        size === 'sm' ? 'h-5 px-2 text-xs' : 'h-6 px-2.5 text-sm',
        toneClasses[tone],
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </span>
  );
}

export interface CountBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  count: number;
  tone?: Extract<StatusTone, 'neutral' | 'critical' | 'muted'>;
}

export function CountBadge({ count, tone = 'neutral', className, ...props }: CountBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular-nums',
        toneClasses[tone],
        className,
      )}
      {...props}
    >
      {count}
    </span>
  );
}

export function Tag({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center rounded-full border border-border bg-surface px-2 text-xs text-text-muted',
        className,
      )}
      {...props}
    />
  );
}

export interface MetadataTextProps extends React.HTMLAttributes<HTMLSpanElement> {
  icon?: React.ReactNode;
}

/** Plain, quiet text for due time / category / location — deliberately never a pill. */
export function MetadataText({ icon, className, children, ...props }: MetadataTextProps) {
  return (
    <span className={cn('inline-flex items-center gap-1 text-sm text-text-muted', className)} {...props}>
      {icon}
      {children}
    </span>
  );
}

function DotIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 8 8" className="h-2 w-2 shrink-0">
      <circle cx="4" cy="4" r="4" fill="currentColor" />
    </svg>
  );
}

function TriangleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3 w-3 shrink-0" fill="none">
      <path
        d="M8 2.5 14.5 13.5H1.5L8 2.5Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M8 6.5v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="8" cy="11.2" r="0.7" fill="currentColor" />
    </svg>
  );
}
