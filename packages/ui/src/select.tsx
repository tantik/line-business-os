'use client';

import { Select as RadixSelect } from 'radix-ui';
import { cn } from './cn';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  'aria-required'?: boolean;
  className?: string;
}

/** Radix Select — full keyboard support (typeahead, arrow navigation), unstyled, painted with ORUWA tokens. */
export function Select({
  value,
  onValueChange,
  options,
  placeholder,
  disabled,
  id,
  className,
  ...aria
}: SelectProps) {
  return (
    <RadixSelect.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <RadixSelect.Trigger
        id={id}
        {...aria}
        className={cn(
          'flex h-11 w-full items-center justify-between gap-2 rounded-md border border-border bg-surface px-3',
          'text-base text-text-primary hover:border-border-strong',
          'disabled:cursor-not-allowed disabled:bg-surface-elevated disabled:opacity-50',
          'aria-invalid:border-danger',
          className,
        )}
      >
        <RadixSelect.Value placeholder={placeholder} />
        <RadixSelect.Icon>
          <ChevronDownIcon />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        <RadixSelect.Content
          position="popper"
          sideOffset={4}
          className="z-[var(--oruwa-z-dropdown)] overflow-hidden rounded-md border border-border bg-surface shadow-dropdown"
        >
          <RadixSelect.Viewport className="p-1">
            {options.map((option) => (
              <RadixSelect.Item
                key={option.value}
                value={option.value}
                disabled={option.disabled}
                className={cn(
                  'flex h-11 cursor-pointer items-center rounded-sm px-3 text-base text-text-primary outline-none',
                  'data-[highlighted]:bg-accent-subtle',
                  'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
                )}
              >
                <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}

function ChevronDownIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4" fill="none">
      <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
