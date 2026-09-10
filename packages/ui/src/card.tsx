import * as React from 'react';
import { cn } from './cn';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** `card` (default, resting surface) or `raised` (hover/interactive — e.g. a clickable list item). */
  elevation?: 'card' | 'raised';
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ elevation = 'card', className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'oruwa-card rounded-md border border-border bg-surface p-5',
        elevation === 'card' ? 'shadow-card' : 'shadow-raised',
        className,
      )}
      {...props}
    />
  ),
);
Card.displayName = 'Card';
