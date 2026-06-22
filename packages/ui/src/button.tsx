import * as React from 'react';
import { cn } from './cn.js';

type Variant = 'primary' | 'secondary' | 'ghost';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const styles: Record<Variant, string> = {
  primary: 'bg-emerald-700 text-white hover:bg-emerald-800',
  secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200',
  ghost: 'bg-transparent text-gray-900 hover:bg-gray-100',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', className, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50',
        styles[variant],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = 'Button';
