import * as React from 'react';
import { cn } from './cn';
import type { StatusTone } from './badge';

export interface InlineAlertProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  tone: Extract<StatusTone, 'info' | 'success' | 'warning' | 'critical'>;
  title?: React.ReactNode;
  action?: React.ReactNode;
}

const toneClasses: Record<InlineAlertProps['tone'], string> = {
  info: 'bg-info-muted text-info-text',
  success: 'bg-success-muted text-success-text',
  warning: 'bg-warning-muted text-warning-text',
  critical: 'bg-danger-muted text-danger-text',
};

/**
 * Replaces the ~15 `{error ? <div style={alertDanger}>...}` call sites
 * (Operations et al.) that had no `role`/`aria-live` — audit finding P1-4.
 * `warning`/`critical` announce as `role="alert"` (interrupts); `info`/
 * `success` as `role="status"` (polite).
 */
export function InlineAlert({ tone, title, action, className, children, ...props }: InlineAlertProps) {
  const isUrgent = tone === 'warning' || tone === 'critical';
  return (
    <div
      role={isUrgent ? 'alert' : 'status'}
      className={cn('flex items-start gap-3 rounded-md p-3 text-sm', toneClasses[tone], className)}
      {...props}
    >
      <div className="flex-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={title ? 'mt-0.5' : undefined}>{children}</div> : null}
      </div>
      {action}
    </div>
  );
}
