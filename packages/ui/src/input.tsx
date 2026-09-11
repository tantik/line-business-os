import * as React from 'react';
import { cn } from './cn';

const controlClasses = cn(
  'w-full rounded-md border border-border bg-surface px-3 text-base text-text-primary placeholder:text-text-muted',
  'hover:border-border-strong',
  'disabled:cursor-not-allowed disabled:bg-surface-elevated disabled:opacity-50',
  'aria-invalid:border-danger aria-invalid:text-danger-text',
  'transition-colors duration-base ease-standard',
);

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(controlClasses, 'h-11', className)} {...props} />
  ),
);
Input.displayName = 'Input';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, rows = 4, ...props }, ref) => (
    <textarea ref={ref} rows={rows} className={cn(controlClasses, 'py-2 leading-normal', className)} {...props} />
  ),
);
Textarea.displayName = 'Textarea';

export interface NumberInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'> {
  value: number | '';
  onValueChange: (value: number | '') => void;
  /** Rendered inline after the field (e.g. "°C", "pcs") — kept in the same visual row as the input. */
  unit?: string;
}

/**
 * Bundles the numeric input with its unit so the pair reads as one control
 * (audit: "for numeric response — unit, threshold, input, save state should
 * read as one coherent interaction", not separate competing elements).
 */
export const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
  ({ value, onValueChange, unit, className, ...props }, ref) => (
    <div className={cn('flex items-center gap-2', className)}>
      <input
        ref={ref}
        type="number"
        inputMode="decimal"
        value={value}
        onChange={(event) => {
          const raw = event.target.value;
          onValueChange(raw === '' ? '' : Number(raw));
        }}
        className={cn(controlClasses, 'h-11 w-full')}
        {...props}
      />
      {unit ? <span className="shrink-0 text-sm text-text-muted">{unit}</span> : null}
    </div>
  ),
);
NumberInput.displayName = 'NumberInput';
