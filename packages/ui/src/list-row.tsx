import * as React from 'react';
import { cn } from './cn';

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
  /**
   * Always renders `status` on its own full-width line under title/subtitle,
   * instead of sharing the row with them. Use when `status` can carry 2-3
   * badges AND `title` can be a long (often bilingual) label -- Founder
   * Acceptance QA2 2026-09-30 (Operations Today's tasks, 768px, live on
   * preview.oruwa.jp): the default inline-with-wrap layout only drops status
   * to its own line once title+status's *combined minimum* width exceeds the
   * row, but at 768px that combined minimum still fit, so title sat at its
   * `min-w-[9rem]` floor and truncated mid-word -- not the 375px zero-collapse
   * bug, a narrower variant of the same "badges crowd the title" problem at a
   * different breakpoint. Default layout stays as-is for every other caller
   * (Templates, Attention, Weekly Review's single-number `status`), where
   * `status` is short enough to share the row safely.
   */
  stackStatus?: boolean;
  className?: string;
}

/**
 * Replaces the ~6 nearly-identical hand-built `<li>` rows across Operations
 * (Templates, Items, Today tasks, Attention events) — technical audit §11.
 */
export function ListRow({ title, subtitle, leading, status, actions, onOpen, muted, stackStatus, className }: ListRowProps) {
  const titleEl = (
    <p className={cn('truncate text-base font-medium', muted ? 'text-text-muted' : 'text-text-primary')}>
      {title}
    </p>
  );
  const subtitleEl = subtitle ? <div className="mt-0.5 truncate">{subtitle}</div> : null;
  const statusGroup = status ? (
    <div className="flex flex-wrap items-center gap-1.5">{status}</div>
  ) : null;

  const content = stackStatus ? (
    <>
      {leading ? <div className="flex h-10 w-10 shrink-0 items-center justify-center">{leading}</div> : null}
      <div className="min-w-0 flex-1">
        {titleEl}
        {subtitleEl}
        {statusGroup ? <div className="mt-1.5 justify-start">{statusGroup}</div> : null}
      </div>
      {actions ? <div className="flex max-w-[30%] shrink-0 items-center gap-1">{actions}</div> : null}
    </>
  ) : (
    <>
      {leading ? <div className="flex h-10 w-10 shrink-0 items-center justify-center">{leading}</div> : null}
      <div className="min-w-[9rem] flex-1">
        {titleEl}
        {subtitleEl}
      </div>
      {/* Founder Acceptance QA1 2026-09-22 (Staff Today's tasks, 375px): the Mission-9 `max-w-[60%]` cap stopped the title collapsing to 0px, but with 2-3 status badges it still claimed ~60% of the row across several stacked lines, squeezing the title into a narrow column and truncating it mid-word. Fixed by giving the title a real `min-w-[9rem]` floor (so it can no longer shrink below a readable width) and letting the *row* wrap (`flex-wrap` below) -- when status badges don't fit beside a title that size, they now drop to their own full-width line under the title/subtitle instead of squeezing it. QA2 2026-09-30 found this floor still truncates long titles at 768px (combined minimum fits without wrapping) -- callers with long titles + multi-badge status should pass `stackStatus` instead of relying on this fallback. */}
      {statusGroup ? <div className="flex shrink-0 justify-end">{statusGroup}</div> : null}
      {/* Same structural risk as `status` above (a `shrink-0` group can force the `min-w-0` title to 0) -- `actions` is contractually a single button/menu (see the prop doc) so this is defense-in-depth, not a reproduced failure. */}
      {actions ? <div className="flex max-w-[30%] shrink-0 items-center gap-1">{actions}</div> : null}
    </>
  );

  const rowClasses = cn(
    'flex w-full min-h-14 flex-wrap items-center gap-3 rounded-md border border-transparent px-3 py-2 text-left',
    muted && 'opacity-65',
    /* Founder Acceptance QA3 2026-10-06: a plain <button> has no built-in
       pointer cursor -- same root cause as Button's own fix. */
    onOpen && 'cursor-pointer hover:border-border hover:bg-surface-elevated',
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
