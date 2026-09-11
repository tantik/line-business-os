import * as React from 'react';
import { cn } from './cn';

export type SkeletonProps = React.HTMLAttributes<HTMLDivElement>;

export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-sm bg-surface-elevated', className)}
      {...props}
    />
  );
}

export interface SkeletonLinesProps {
  lines?: number;
  /** Screen-reader-announced loading label — closes the audit finding that `Skeleton` had `aria-hidden` with no `aria-busy` wrapper (a screen reader heard nothing while content loaded). */
  label: string;
  className?: string;
}

export function SkeletonLines({ lines = 3, label, className }: SkeletonLinesProps) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className={cn('flex flex-col gap-2', className)}>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton key={index} className="h-4 w-full last:w-2/3" />
      ))}
    </div>
  );
}
