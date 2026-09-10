import * as React from 'react';
import { cn } from './cn.js';

export interface ListRowProps {
  /** Primary line — task/template/item name. */
  title: React.ReactNode;
  /** Quiet secondary line — metadata (category, due time, location). Use `MetadataText`/plain text, never badges. */
  subtitle?: React.ReactNode;
  /** Leading visual (icon/avatar), fixed 40px box. */
  leading?: React.ReactNode;
  /** Status/severity badges — trailing, before actions. */
  status?: React.ReactNode;
  /** `Menu` (•••) or a single primary action — never more than one inline button beside `status`. */
  actions?: React.ReactNode;
  /** Row acts as a single "open" target — renders as a real `<button>`, never `<li role="button">` (audit P1-6). Omit for a row with no row-level navigation (only per-item controls). */
  onOpen?: () => void;
  /** Retired/completed/inactive rows read as visually quieter, not removed (audit: "completed Staff rows aren't dimmed though retired templates are"). */
  muted?: boolean;
  className?: string;
}

/**
 * Replaces the ~6 nearly-identical hand-built `<li>` rows across Operations
 * (Templates, Items, Today tasks, Attention events) — technical audit §11.
 */
export function ListRow({ title, subtitle, leading, status, actions, onOpen, muted, className }: ListRowProps) {
  const content = (
    <>
      {leading ? <div className="flex h-10 w-10 shrink-0 items-center justify-center">{leading}</div> : null}
      <div className="min-w-0 flex-1">
        <p className={cn('truncate text-base font-medium', muted ? 'text-text-muted' : 'text-text-primary')}>
          {title}
        </p>
        {subtitle ? <div className="mt-0.5 truncate">{subtitle}</div> : null}
      </div>
      {status ? <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">{status}</div> : null}
      {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
    </>
  );

  const rowClasses = cn(
    'flex w-full min-h-14 items-center gap-3 rounded-md border border-transparent px-3 py-2 text-left',
    muted && 'opacity-65',
    onOpen && 'hover:border-border hover:bg-surface-elevated',
    className,
  );

  if (onOpen) {
    return (
      <button type="button" onClick={onOpen} className={rowClasses}>
        {content}
      </button>
    );
  }

  return <div className={rowClasses}>{content}</div>;
}
