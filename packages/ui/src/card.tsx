import * as React from 'react';
import { color, radius, space, shadow } from '@line-os/tokens';
import { cn } from './cn.js';

/** Phase 0 interim — see `button.tsx` for the Tailwind-removal note. */
const cardStyle: React.CSSProperties = {
  borderRadius: radius.md,
  border: `1px solid ${color.border}`,
  background: color.surface,
  padding: space[5],
  boxShadow: shadow.sm,
};

export function Card({ className, style, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('oruwa-card', className)} style={{ ...cardStyle, ...style }} {...props} />
  );
}
