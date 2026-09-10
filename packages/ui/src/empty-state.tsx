import * as React from 'react';
import { cn } from './cn.js';

export interface EmptyStateProps {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center gap-2 px-6 py-10 text-center', className)}>
      <p className="text-base font-semibold text-text-primary">{title}</p>
      {description ? <p className="max-w-[360px] text-sm text-text-muted">{description}</p> : null}
      {action}
    </div>
  );
}
