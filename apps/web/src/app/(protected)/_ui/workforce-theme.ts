import type { CSSProperties } from 'react';
import { badgeStyle, card, colors } from '@/lib/ui/theme';
import type { Lang } from '@/lib/demo/cafe/i18n';

// Re-exported for existing call sites in this dashboard tree; the canonical
// implementation now lives in `@/lib/workforce/timezone.ts` (shared with the
// `_client-preview` surface). New call sites should import it from there
// directly rather than from this dashboard-page-scoped module.
export { todayIsoInTimeZone } from '@/lib/workforce/timezone';

/**
 * Workforce-scoped visual helpers layered on top of `@/lib/ui/theme`.
 *
 * Additive only: every export here composes the shared dark tokens (colors,
 * card, badgeStyle) rather than introducing new hex values or a parallel
 * palette. Shared across the canonical Manager, Staff, Recipes, and
 * Workforce-landing surfaces (all under `(protected)/`) so it never becomes
 * a second source of truth for the rest of the dashboard.
 */

/** `card` variant with an accent left-border for the one or two sections per page that deserve more visual weight. */
export const primaryCard: CSSProperties = {
  ...card,
  borderLeft: `3px solid ${colors.accent}`,
};

/** Renders the requested clock-in/out/break a correction's `details` carries (see `submitCorrectionRequest`/`decideCorrectionRequest`, shift-requests.ts), so Manager sees what will actually be applied on approval -- not just the free-text reason. */
export function formatRequestedCorrectionChange(details: Record<string, unknown>): string {
  const clockIn = typeof details.clockInLocal === 'string' ? details.clockInLocal : null;
  const clockOut = typeof details.clockOutLocal === 'string' ? details.clockOutLocal : null;
  const breakMinutes = typeof details.actualBreakMinutes === 'number' ? details.actualBreakMinutes : null;
  const parts: string[] = [];
  if (clockIn || clockOut) parts.push(`${clockIn ?? '-'} - ${clockOut ?? '-'}`);
  if (breakMinutes !== null) parts.push(`${breakMinutes}min break`);
  return parts.length > 0 ? parts.join(', ') : '-';
}

/** Subtle row tint for the table row matching today's date. */
export const todayRowStyle: CSSProperties = {
  background: colors.accentMuted,
};

/** `buttonSecondary`-shaped variant tinted for a destructive action (e.g. Deactivate). */
export const buttonDanger: CSSProperties = {
  padding: '8px 14px',
  background: colors.dangerMuted,
  color: colors.dangerText,
  border: `1px solid ${colors.danger}`,
  borderRadius: 8,
  fontSize: 14,
  cursor: 'pointer',
};

// WP A8: `colors.accent`/`colors.success` are the SAME hex value in this
// palette (`@/lib/ui/theme.ts`), so a naive 3rd "success" tone here would be
// visually indistinguishable from the 1st -- found via the position-based
// no-collision test below actually failing. `colors.danger`/`dangerMuted`
// is the only other genuinely distinct hue in the palette; repurposing it
// for a shift-type chip is no different from `warning` already being reused
// below for a plain, non-error visual category.
const CHIP_TONES: ReadonlyArray<{ background: string; color: string }> = [
  { background: colors.accentMuted, color: colors.accent },
  { background: 'rgba(184, 134, 59, 0.14)', color: colors.warning },
  { background: colors.dangerMuted, color: colors.danger },
];

const UNSET_CHIP_TONE = { background: colors.surfaceElevated, color: colors.textMuted };

/**
 * Deterministic tone for a shift type id, so the same shift code always
 * renders the same chip color. When `allActiveShiftTypeIds` is supplied
 * (WP A8), the tone is picked by the id's stable position in that list
 * instead of a raw hash -- this guarantees no two currently-active shift
 * types collide on the same tone as long as there are no more active types
 * than `CHIP_TONES` has entries (today: 3), rather than leaving it to hash
 * chance. Falls back to the hash when the id isn't in the list (an
 * assignment referencing a since-deactivated type not passed in) or when no
 * list is given at all (existing call sites stay unchanged/backward
 * compatible).
 */
export function shiftChipColors(
  shiftTypeId: string | null | undefined,
  allActiveShiftTypeIds?: readonly string[],
): { background: string; color: string } {
  if (!shiftTypeId) return UNSET_CHIP_TONE;
  if (allActiveShiftTypeIds && allActiveShiftTypeIds.length > 0) {
    const index = allActiveShiftTypeIds.indexOf(shiftTypeId);
    if (index !== -1) return CHIP_TONES[index % CHIP_TONES.length] ?? UNSET_CHIP_TONE;
  }
  let hash = 0;
  for (let i = 0; i < shiftTypeId.length; i += 1) {
    hash = (hash * 31 + shiftTypeId.charCodeAt(i)) >>> 0;
  }
  return CHIP_TONES[hash % CHIP_TONES.length] ?? UNSET_CHIP_TONE;
}

export function shiftChipStyle(tone: { background: string; color: string }): CSSProperties {
  return {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 6,
    background: tone.background,
    color: tone.color,
    fontSize: 12,
    fontWeight: 600,
  };
}

const CORRECTION_STATUS_LABELS: Record<Lang, Record<string, string>> = {
  en: {
    pending: 'Pending',
    approved: 'Approved',
    rejected: 'Rejected',
  },
  ja: {
    pending: '保留中',
    approved: '承認済み',
    rejected: '却下',
  },
};

/**
 * Display-only friendlier label for a raw correction-request status value;
 * does not change the underlying value. `lang` defaults to `'en'` so the
 * Manager dashboard (which has no `LangProvider`/`useLang` mechanism, out of
 * this mission's scope) keeps its existing English-only call sites
 * unchanged; the canonical Staff dashboard passes its own `lang`.
 */
export function correctionStatusLabel(status: string, lang: Lang = 'en'): string {
  return CORRECTION_STATUS_LABELS[lang][status] ?? status;
}

const ATTENDANCE_STATUS_LABELS: Record<Lang, Record<string, string>> = {
  en: {
    present: 'Present',
    late: 'Late',
    absent: 'Absent',
    on_leave: 'On leave',
  },
  ja: {
    present: '出勤',
    late: '遅刻',
    absent: '欠勤',
    on_leave: '休暇',
  },
};

/**
 * Display-only friendlier label for a raw `workforce.attendance_status`
 * value (`present`/`late`/`absent`/`on_leave` -- a controlled DB enum,
 * `supabase/migrations/0009_workforce.sql`, not user-entered text). Does not
 * change the underlying value. `lang` defaults to `'en'` for the same reason
 * as `correctionStatusLabel`.
 */
export function attendanceStatusLabel(status: string, lang: Lang = 'en'): string {
  return ATTENDANCE_STATUS_LABELS[lang][status] ?? status;
}

export function correctionStatusBadgeStyle(status: string): CSSProperties {
  return badgeStyle(status === 'approved' ? 'active' : status === 'rejected' ? 'inactive' : 'neutral');
}

const EXCHANGE_STATUS_LABELS: Record<Lang, Record<string, string>> = {
  en: {
    open: 'Open',
    accepted: 'Accepted',
    approved: 'Approved',
    rejected: 'Rejected',
    cancelled: 'Cancelled',
  },
  ja: {
    open: '募集中',
    accepted: '承諾済み',
    approved: '承認済み',
    rejected: '却下',
    cancelled: 'キャンセル済み',
  },
};

/**
 * Display-only friendlier label for a raw shift-exchange status value; does
 * not change the underlying value. `lang` defaults to `'en'` for backward
 * compatibility with call sites predating the Manager dashboard's Mission 2
 * `LangProvider` adoption; the Manager dashboard itself now always passes
 * its own `lang`.
 */
export function exchangeStatusLabel(status: string, lang: Lang = 'en'): string {
  return EXCHANGE_STATUS_LABELS[lang][status] ?? status;
}

export function exchangeStatusBadgeStyle(status: string): CSSProperties {
  return badgeStyle(status === 'approved' ? 'active' : status === 'rejected' || status === 'cancelled' ? 'inactive' : 'neutral');
}
