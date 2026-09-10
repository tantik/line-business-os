'use client';

import * as React from 'react';
import { Checkbox as RadixCheckbox } from 'radix-ui';
import { cn } from './cn';

export interface CheckboxProps {
  id?: string;
  checked: boolean | 'indeterminate';
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  label: React.ReactNode;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  className?: string;
}

/**
 * The whole row (box + label) is a 44px-min-height click/tap target, not
 * just the 16px visual box — audit touch-target finding, applied to the
 * highest-frequency control class (Operations checklist items).
 */
export function Checkbox({
  id,
  checked,
  onCheckedChange,
  disabled,
  label,
  className,
  ...aria
}: CheckboxProps) {
  const generatedId = React.useId();
  const resolvedId = id ?? generatedId;
  return (
    <label
      htmlFor={resolvedId}
      className={cn(
        'flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-1',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      <RadixCheckbox.Root
        id={resolvedId}
        checked={checked}
        onCheckedChange={(next) => onCheckedChange(next === true)}
        disabled={disabled}
        {...aria}
        className={cn(
          'flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border border-border-strong bg-surface',
          'data-[state=checked]:border-accent data-[state=checked]:bg-accent',
          'data-[state=indeterminate]:border-accent data-[state=indeterminate]:bg-accent',
          'aria-invalid:border-danger',
        )}
      >
        <RadixCheckbox.Indicator className="text-text-on-accent">
          {checked === 'indeterminate' ? <MinusIcon /> : <CheckIcon />}
        </RadixCheckbox.Indicator>
      </RadixCheckbox.Root>
      <span className="text-base text-text-primary">{label}</span>
    </label>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none">
      <path d="M3 8l3.5 3.5L13 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MinusIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none">
      <path d="M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
