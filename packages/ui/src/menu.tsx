'use client';

import * as React from 'react';
import { DropdownMenu } from 'radix-ui';
import { cn } from './cn.js';
import { IconButton } from './button.js';

export interface MenuItem {
  key: string;
  label: React.ReactNode;
  onSelect: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

export interface MenuProps {
  items: MenuItem[];
  /** Accessible name for the trigger (••• button). */
  label: string;
  align?: 'start' | 'end';
}

/**
 * The ••• trigger for secondary/rare/dangerous row actions (charter: don't
 * put `Edit/Replace/Retire` as three equal-weight inline buttons — audit
 * finding on Operations template rows). Radix DropdownMenu gives full
 * keyboard support (arrow navigation, typeahead) and collision-aware
 * positioning for free.
 */
export function Menu({ items, label, align = 'end' }: MenuProps) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <IconButton aria-label={label} variant="secondary" size="md" icon={<DotsIcon />} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align={align}
          sideOffset={4}
          className="z-[var(--oruwa-z-dropdown)] min-w-[180px] overflow-hidden rounded-md border border-border bg-surface p-1 shadow-dropdown"
        >
          {items.map((item) => (
            <DropdownMenu.Item
              key={item.key}
              disabled={item.disabled}
              onSelect={item.onSelect}
              className={cn(
                'flex h-10 cursor-pointer items-center rounded-sm px-3 text-sm outline-none',
                item.destructive ? 'text-danger-text' : 'text-text-primary',
                'data-[highlighted]:bg-accent-subtle',
                'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
              )}
            >
              {item.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function DotsIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor">
      <circle cx="3" cy="8" r="1.4" />
      <circle cx="8" cy="8" r="1.4" />
      <circle cx="13" cy="8" r="1.4" />
    </svg>
  );
}
