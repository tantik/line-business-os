'use client';

import * as React from 'react';
import { Tabs } from 'radix-ui';
import { cn } from './cn.js';

export interface SegmentedControlOption {
  value: string;
  label: React.ReactNode;
}

export interface SegmentedControlProps {
  value: string;
  onValueChange: (value: string) => void;
  options: SegmentedControlOption[];
  'aria-label': string;
  className?: string;
}

/**
 * View-switcher (Operations' Templates/Today/Attention style segments), not
 * a content-tabs pattern — so this wraps `Tabs.List` + `Tabs.Trigger` only
 * (arrow-key navigation, `role="tablist"`, `aria-controls` for free) without
 * `Tabs.Content` panels; the caller renders whichever view is selected.
 * `flex-wrap` closes the audit finding that Operations' EN segment labels
 * ("Templates / Today / Attention (3)") could clip under ~360px.
 */
export function SegmentedControl({ value, onValueChange, options, className, ...aria }: SegmentedControlProps) {
  return (
    <Tabs.Root value={value} onValueChange={onValueChange}>
      <Tabs.List
        {...aria}
        className={cn('flex flex-wrap gap-1 rounded-md bg-surface-elevated p-1', className)}
      >
        {options.map((option) => (
          <Tabs.Trigger
            key={option.value}
            value={option.value}
            className={cn(
              'min-h-9 rounded-sm px-3 text-sm font-medium text-text-muted outline-none',
              'data-[state=active]:bg-surface data-[state=active]:text-text-primary data-[state=active]:shadow-card',
              'hover:text-text-primary',
            )}
          >
            {option.label}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
    </Tabs.Root>
  );
}
