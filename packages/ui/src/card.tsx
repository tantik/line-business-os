import * as React from 'react';
import { cn } from './cn.js';

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-lg border border-gray-200 bg-white p-4 shadow-sm', className)}
      {...props}
    />
  );
}
