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
 * palette. Kept local to `dashboard/workforce/` so it never becomes a second
 * source of truth for the rest of the dashboard.
 */

/** `card` variant with an accent left-border for the one or two sections per page that deserve more visual weight. */
export const primaryCard: CSSProperties = {
  ...card,
  borderLeft: `3px solid ${colors.accent}`,
};

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

const CHIP_TONES: ReadonlyArray<{ background: string; color: string }> = [
  { background: colors.accentMuted, color: colors.accent },
  { background: 'rgba(251, 191, 36, 0.14)', color: colors.warning },
  { background: colors.successMuted, color: colors.success },
];

const UNSET_CHIP_TONE = { background: colors.surfaceElevated, color: colors.textMuted };

/** Deterministic tone for a shift type id, so the same shift code always renders the same chip color. */
export function shiftChipColors(shiftTypeId: string | null | undefined): { background: string; color: string } {
  if (!shiftTypeId) return UNSET_CHIP_TONE;
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

const EXCHANGE_STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  accepted: 'Accepted',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

/** Display-only friendlier label for a raw shift-exchange status value; does not change the underlying value. */
export function exchangeStatusLabel(status: string): string {
  return EXCHANGE_STATUS_LABELS[status] ?? status;
}

export function exchangeStatusBadgeStyle(status: string): CSSProperties {
  return badgeStyle(status === 'approved' ? 'active' : status === 'rejected' || status === 'cancelled' ? 'inactive' : 'neutral');
}
