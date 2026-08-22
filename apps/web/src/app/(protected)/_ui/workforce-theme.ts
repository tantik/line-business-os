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

/**
 * Weekly Schedule redesign (2026-08-22): capacity raised from 3 to 10
 * distinct, deliberately-chosen tones -- a 3-tone palette started colliding
 * as soon as a cafe configured a 4th shift type (already true for the Cafe
 * v2.1 reference tenant). Every entry stays inside this one file (the
 * established shift-color extension point, see `shiftChipColors` below)
 * instead of being invented ad hoc inside the schedule grid.
 *
 * Hues are chosen to sit visibly apart from each other AND from this
 * palette's own `warning`/`danger` tones (a shift color must never be
 * mistaken for a status/severity signal -- that's what `badgeStyle` and the
 * grid's own conflict/understaffed markers are for). Each tone pairs a
 * ~12%-alpha tint (background) with a solid text/border color, the same
 * background+solid-text shape every other tone in this file already uses,
 * so a chip's text stays readable on the warm `colors.bg`/`colors.surface`
 * ground in both a light table cell and the legend.
 *
 * Founder Review Round 2 (2026-08-22): the first version of this palette
 * spaced 9 of the 10 hues only ~24-36 degrees apart at near-identical
 * lightness/saturation -- distinguishable in an isolated swatch, too close
 * side by side in a real grid. Regenerated with a small script (not by eye)
 * that greedily maximizes the minimum pairwise RGB distance across a hue/
 * lightness search space already filtered to exclude the `warning`/`danger`
 * neighborhood and a yellow band that read as "belongs to the warning
 * family" even when numerically distinct -- lower, calmer saturation (42%)
 * than a first attempt at this that came out looking like a rainbow.
 * `workforce-theme.test.ts` asserts the same minimum distance this script
 * enforced, so the palette can't quietly drift back together in a future
 * edit.
 */
const CHIP_TONES: ReadonlyArray<{ background: string; color: string }> = [
  { background: colors.accentMuted, color: colors.accent }, // sage (existing accent)
  { background: 'rgba(163, 67, 163, 0.14)', color: '#A343A3' }, // magenta
  { background: 'rgba(67, 67, 163, 0.14)', color: '#4343A3' }, // indigo
  { background: 'rgba(109, 44, 44, 0.16)', color: '#6D2C2C' }, // maroon
  { background: 'rgba(67, 163, 163, 0.14)', color: '#43A3A3' }, // teal
  { background: 'rgba(139, 163, 67, 0.14)', color: '#8BA343' }, // olive/moss
  { background: 'rgba(163, 67, 91, 0.14)', color: '#A3435B' }, // rose
  { background: 'rgba(98, 44, 109, 0.14)', color: '#622C6D' }, // violet
  { background: 'rgba(44, 82, 109, 0.14)', color: '#2C526D' }, // slate blue
  { background: 'rgba(72, 66, 60, 0.14)', color: '#48423C' }, // stone (near-neutral)
];

const UNSET_CHIP_TONE = { background: colors.surfaceElevated, color: colors.textMuted };

function hashToIndex(id: string, mod: number): number {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return hash % mod;
}

/**
 * Deterministic tone for a shift type id -- stable per-id, not per-position,
 * so reordering, adding, or deactivating unrelated shift types never
 * repaints a shift type that didn't change (Weekly Schedule redesign,
 * 2026-08-22 -- the previous WP A8 version picked a tone by the id's index
 * in `allActiveShiftTypeIds`, so any reorder/add/remove could shift every
 * *other* type's color too). No DB migration/persisted color column exists
 * for this, so the mapping is derived purely from the id's own hash, which
 * is stable for the life of that id by construction.
 *
 * A pure hash alone cannot guarantee zero collisions among the currently
 * active set, so when `allActiveShiftTypeIds` is supplied, this also runs a
 * deterministic collision pass: ids are visited in a fixed order (sorted by
 * id, never by display/sort order, so the pass itself is reorder-immune),
 * and any id whose hash slot is already taken by an *earlier-sorted* id
 * moves to the next free slot. With `CHIP_TONES.length` (10) or fewer
 * active ids this guarantees every one gets a distinct tone; beyond that,
 * remaining ids fall back to their plain (possibly colliding) hash tone --
 * an explicit, documented capacity limit, not a crash.
 */
export function shiftChipColors(
  shiftTypeId: string | null | undefined,
  allActiveShiftTypeIds?: readonly string[],
): { background: string; color: string } {
  if (!shiftTypeId) return UNSET_CHIP_TONE;
  if (!allActiveShiftTypeIds || allActiveShiftTypeIds.length === 0) {
    return CHIP_TONES[hashToIndex(shiftTypeId, CHIP_TONES.length)] ?? UNSET_CHIP_TONE;
  }

  const sortedIds = Array.from(new Set(allActiveShiftTypeIds)).sort();
  const taken = new Set<number>();
  const assigned = new Map<string, number>();
  for (const id of sortedIds) {
    const preferred = hashToIndex(id, CHIP_TONES.length);
    if (taken.size >= CHIP_TONES.length) {
      // Capacity exhausted (more than CHIP_TONES.length active ids) --
      // remaining ids reuse their plain hash slot rather than looping
      // forever looking for a free one that no longer exists.
      assigned.set(id, preferred);
      continue;
    }
    let slot = preferred;
    while (taken.has(slot)) slot = (slot + 1) % CHIP_TONES.length;
    taken.add(slot);
    assigned.set(id, slot);
  }

  const index = assigned.get(shiftTypeId);
  if (index !== undefined) return CHIP_TONES[index] ?? UNSET_CHIP_TONE;
  // Not in the active-ids list at all (a since-deactivated type) -- same
  // plain hash fallback as the no-list case.
  return CHIP_TONES[hashToIndex(shiftTypeId, CHIP_TONES.length)] ?? UNSET_CHIP_TONE;
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
