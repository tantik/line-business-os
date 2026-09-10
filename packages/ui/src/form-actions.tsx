import * as React from 'react';
import { cn } from './cn.js';

export interface FormActionsProps {
  primary: React.ReactNode;
  secondary?: React.ReactNode;
  /** Pin to the bottom of the nearest scroll container (Staff mobile task footer — audit: "main actions found only after a long checklist, not sticky"). */
  sticky?: boolean;
  className?: string;
}

/** Replaces the ~10 hand-built `LoadingButton + Cancel` footer copies across Operations. */
export function FormActions({ primary, secondary, sticky, className }: FormActionsProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-end gap-2.5 border-t border-border bg-surface px-5 py-3.5',
        sticky && 'sticky bottom-0',
        className,
      )}
    >
      {secondary}
      {primary}
    </div>
  );
}
