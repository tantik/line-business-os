'use client';

import * as React from 'react';
import { cn } from './cn.js';

function useFieldId(explicitId?: string): string {
  const generated = React.useId();
  return explicitId ?? generated;
}

export interface FieldProps {
  label: string;
  htmlFor?: string;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  children: (fieldProps: {
    id: string;
    'aria-describedby': string | undefined;
    'aria-invalid': boolean | undefined;
    'aria-required': boolean | undefined;
  }) => React.ReactNode;
  className?: string;
}

/**
 * Closes audit finding P1-4 (custom validation errors were rendered as a
 * plain `<div>` with no `role="alert"`/`aria-live` and no `aria-describedby`
 * back to the field). Render-prop `children` so it works with any control
 * (Input, Textarea, Select, NumberInput, Checkbox) without a generic wrapper
 * that would hide the underlying element's own props/ref.
 */
export function Field({ label, htmlFor, hint, error, required, children, className }: FieldProps) {
  const id = useFieldId(htmlFor);
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-medium text-text-primary">
        {label}
        {required ? (
          <span aria-hidden="true" className="text-danger-text">
            {' '}
            *
          </span>
        ) : null}
      </label>
      {children({
        id,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
        'aria-required': required || undefined,
      })}
      {hint ? (
        <p id={hintId} className="text-sm text-text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-danger-text">
          {error}
        </p>
      ) : null}
    </div>
  );
}
