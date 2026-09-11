'use client';

import * as React from 'react';
import { Tooltip as RadixTooltip } from 'radix-ui';

export interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactElement;
  side?: 'top' | 'right' | 'bottom' | 'left';
}

/**
 * Keyboard/screen-reader-accessible replacement for the ~120-174 native
 * `title=` attributes across the app (audit: browser tooltips are not
 * reliably announced and never appear on touch). Not a mechanical sweep in
 * this mission — the primitive exists for new/touched code to use.
 */
export function Tooltip({ content, children, side = 'top' }: TooltipProps) {
  return (
    <RadixTooltip.Provider delayDuration={300}>
      <RadixTooltip.Root>
        <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
        <RadixTooltip.Portal>
          <RadixTooltip.Content
            side={side}
            sideOffset={6}
            className="z-[var(--oruwa-z-tooltip)] max-w-[240px] rounded-sm bg-text-primary px-2.5 py-1.5 text-xs text-surface shadow-raised"
          >
            {content}
            <RadixTooltip.Arrow className="fill-text-primary" />
          </RadixTooltip.Content>
        </RadixTooltip.Portal>
      </RadixTooltip.Root>
    </RadixTooltip.Provider>
  );
}
