import type { CSSProperties } from 'react';
import type { ShiftTypeDef } from './types';

/**
 * Self-contained warm/light style tokens for the cafe demo (`/demo/cafe*`).
 *
 * Deliberately does NOT reuse `@/lib/ui/theme` (the shared dark app theme
 * used by /dashboard) — the cafe demo has its own light, cafe-friendly
 * palette and must not affect or depend on the authenticated app's look.
 */
export const demoColors = {
  bg: '#FAF3E7',
  surface: '#FFFFFF',
  surfaceElevated: '#F6EEDF',
  selfRowSolidBg: '#FBF1DE',
  border: '#E7D9C1',
  borderStrong: '#D8C6A4',
  textPrimary: '#362B1F',
  textMuted: '#8B7C64',

  accent: '#4F7A52',
  accentStrong: '#3B5C3E',
  accentMuted: 'rgba(79, 122, 82, 0.12)',

  gold: '#C0983F',
  goldDark: '#8A6A22',
  goldMuted: 'rgba(192, 152, 63, 0.14)',

  danger: '#C1503F',
  dangerMuted: 'rgba(193, 80, 63, 0.12)',
  dangerText: '#A6402F',

  success: '#4F7A52',
  successMuted: 'rgba(79, 122, 82, 0.12)',

  warning: '#B8863B',

  todayBg: 'rgba(79, 122, 82, 0.10)',
  selfRowBg: 'rgba(192, 152, 63, 0.08)',
  selfTodayBg: 'rgba(79, 122, 82, 0.20)',

  badgePopular: '#B5542A',
  badgePopularBg: 'rgba(181, 84, 42, 0.12)',
  badgeNew: '#3F7A5C',
  badgeNewBg: 'rgba(63, 122, 92, 0.12)',
  badgeSeasonal: '#8A5FA8',
  badgeSeasonalBg: 'rgba(138, 95, 168, 0.12)',
  badgeInstruction: '#2F6690',
  badgeInstructionBg: 'rgba(47, 102, 144, 0.14)',

  alertWarningBg: 'rgba(184, 134, 59, 0.10)',
  alertDangerBg: 'rgba(193, 80, 63, 0.10)',

  /** Extremely subtle zebra-row tint for the manager (non-compact) shift table — row-scanning aid that never competes with the today/self highlights. */
  zebraRowBg: 'rgba(54, 43, 31, 0.025)',

  /** Very light vertical column separator for the shift table — subtle by design, must never read as a heavy grid line. */
  columnDivider: 'rgba(54, 43, 31, 0.07)',
} as const;

/** Shared default corner radius for cards, tables, modals, inputs, and buttons across the cafe demo. */
export const RADIUS = 8;

/** Desktop-first page shell (manager dashboard). */
export function pageStyle(maxWidth: number): CSSProperties {
  return { maxWidth, margin: '0 auto', padding: '28px 20px 48px' };
}

/** Mobile-first page shell: near-edge side padding on phones, roomier once the viewport allows it. */
export function mobilePageStyle(maxWidth: number): CSSProperties {
  return { maxWidth, margin: '0 auto', padding: '16px clamp(2px, 1vw, 16px) 40px' };
}

export const card: CSSProperties = {
  border: `1px solid ${demoColors.border}`,
  borderRadius: RADIUS,
  padding: 18,
  marginTop: 16,
  background: demoColors.surface,
  boxShadow: '0 1px 2px rgba(54, 43, 31, 0.04), 0 10px 24px rgba(54, 43, 31, 0.05)',
};

export const mutedText: CSSProperties = { color: demoColors.textMuted };

export const linkAccent: CSSProperties = { color: demoColors.accent, textDecoration: 'none' };

export const buttonPrimary: CSSProperties = {
  padding: '12px 18px',
  background: demoColors.accent,
  color: '#FFFFFF',
  border: 'none',
  borderRadius: RADIUS,
  fontSize: 14,
  fontWeight: 700,
  cursor: 'pointer',
  textDecoration: 'none',
  lineHeight: 1.35,
  appearance: 'none',
};

export const buttonSecondary: CSSProperties = {
  padding: '10px 16px',
  background: demoColors.surface,
  color: demoColors.textPrimary,
  border: `1px solid ${demoColors.border}`,
  borderRadius: RADIUS,
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  textDecoration: 'none',
  lineHeight: 1.35,
  appearance: 'none',
};

export const buttonDisabled: CSSProperties = {
  padding: '10px 16px',
  background: demoColors.surfaceElevated,
  color: demoColors.textMuted,
  border: `1px solid ${demoColors.border}`,
  borderRadius: RADIUS,
  fontSize: 14,
  cursor: 'not-allowed',
  textDecoration: 'none',
  lineHeight: 1.35,
  appearance: 'none',
};

export const input: CSSProperties = {
  display: 'block',
  width: '100%',
  boxSizing: 'border-box',
  marginTop: 4,
  padding: '10px 12px',
  background: demoColors.surface,
  border: `1px solid ${demoColors.border}`,
  borderRadius: RADIUS,
  color: demoColors.textPrimary,
  fontSize: 14,
};

export const tableHeaderCell: CSSProperties = {
  borderBottom: `1px solid ${demoColors.border}`,
  padding: '8px 10px',
  color: demoColors.textMuted,
  textAlign: 'left',
};

export const tableCell: CSSProperties = {
  borderBottom: `1px solid ${demoColors.border}`,
  padding: '10px',
};

export type BadgeTone = 'active' | 'inactive' | 'neutral' | 'warning';

/** Same tone vocabulary/shape as `@/lib/ui/theme`'s `badgeStyle` (active/inactive/neutral/warning), rendered in the light cafe palette — a drop-in swap for any caller that already uses the dark app theme's badge helper. */
export function badgeStyle(tone: BadgeTone): CSSProperties {
  const tones: Record<BadgeTone, { background: string; color: string; border: string }> = {
    active: { background: demoColors.successMuted, color: demoColors.success, border: demoColors.success },
    inactive: { background: demoColors.surfaceElevated, color: demoColors.textMuted, border: demoColors.border },
    neutral: { background: demoColors.accentMuted, color: demoColors.accent, border: demoColors.accent },
    warning: { background: demoColors.dangerMuted, color: demoColors.dangerText, border: demoColors.danger },
  };
  const t = tones[tone];
  return {
    display: 'inline-block',
    padding: '2px 8px',
    border: `1px solid ${t.border}`,
    borderRadius: 999,
    background: t.background,
    color: t.color,
    fontSize: 12,
    lineHeight: 1.5,
  };
}

export const shiftChipStyle = (background: string, color: string, compact = false): CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: compact ? 22 : 34,
  padding: compact ? '2px 3px' : '4px 6px',
  borderRadius: compact ? 6 : 8,
  fontSize: compact ? 10 : 12,
  fontWeight: 700,
  background,
  color,
  whiteSpace: 'nowrap',
});

/** Custom shift types often already use "HH:mm-HH:mm" as their label — avoid showing the time range twice. */
export function shiftTypeDisplayLabel(type: ShiftTypeDef): string {
  if (!type.startTime || !type.endTime) return type.label;
  if (type.label.includes(type.startTime)) return type.label;
  return `${type.label} (${type.startTime}-${type.endTime})`;
}

/** Compact icon (not text-pill) treatment for recipe badges — avoids large noisy badge text on the recipe strip/detail. */
export const RECIPE_BADGE_ICON: Record<'人気' | 'New' | '季節限定', { icon: string; background: string; color: string }> = {
  人気: { icon: '★', background: demoColors.badgePopularBg, color: demoColors.badgePopular },
  New: { icon: 'N', background: demoColors.badgeNewBg, color: demoColors.badgeNew },
  季節限定: { icon: 'S', background: demoColors.badgeSeasonalBg, color: demoColors.badgeSeasonal },
};

export const INSTRUCTION_ICON = {
  icon: 'i',
  background: demoColors.badgeInstructionBg,
  color: demoColors.badgeInstruction,
} as const;

export function recipeBadgeIconStyle(background: string, color: string): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 16,
    height: 16,
    flexShrink: 0,
    borderRadius: '50%',
    fontSize: 9.5,
    fontWeight: 800,
    background,
    color,
  };
}

const BUILT_IN_SHIFT_TYPE_IDS = new Set(['shift1', 'shift2', 'shift3', 'full', 'dayoff']);

/** Rotating palette for custom (non-built-in) shift types — assigned by position, never by hash, so no two custom shift types showing on screen together ever land on the same color until every slot is used. */
const CUSTOM_SHIFT_TYPE_PALETTE: ReadonlyArray<{ background: string; color: string }> = [
  { background: 'rgba(199, 118, 51, 0.16)', color: '#9B5A26' },
  { background: 'rgba(69, 123, 157, 0.16)', color: '#2F6690' },
  { background: 'rgba(106, 153, 78, 0.16)', color: '#3F6B2A' },
  { background: 'rgba(155, 89, 182, 0.16)', color: '#6C3483' },
  { background: 'rgba(230, 126, 34, 0.16)', color: '#A0522D' },
  { background: 'rgba(52, 152, 219, 0.16)', color: '#1A5276' },
  { background: 'rgba(199, 61, 99, 0.16)', color: '#9B2242' },
  { background: 'rgba(90, 90, 90, 0.16)', color: '#4A4A4A' },
];

/**
 * Chip color for one shift type. `allShiftTypeIds` (the full, stably-ordered
 * list of shift type ids currently on screen -- e.g. `sortOrder`-sorted from
 * the DB, or the demo's fixed option order) lets every *custom* id be given
 * the next unused palette slot by position, so two custom shift types never
 * share a color as long as there are more palette slots than custom types.
 * Without it (a handful of call sites that only ever render one assignment in
 * isolation), falls back to a deterministic hash -- same as before, kept only
 * for backward compatibility at those sites.
 */
export function shiftChipColors(
  shiftTypeId: string | null,
  allShiftTypeIds?: readonly string[],
): { background: string; color: string } {
  switch (shiftTypeId) {
    case 'shift1':
      return { background: 'rgba(199, 118, 51, 0.16)', color: '#9B5A26' };
    case 'shift2':
      return { background: 'rgba(69, 123, 157, 0.16)', color: '#2F6690' };
    case 'shift3':
      return { background: demoColors.badgeSeasonalBg, color: demoColors.badgeSeasonal };
    case 'full':
      return { background: demoColors.accentMuted, color: demoColors.accentStrong };
    case 'dayoff':
      return { background: demoColors.surfaceElevated, color: demoColors.textMuted };
    case null:
      return { background: 'transparent', color: demoColors.textMuted };
    default: {
      if (allShiftTypeIds && allShiftTypeIds.length > 0) {
        const customIds = allShiftTypeIds.filter((id) => !BUILT_IN_SHIFT_TYPE_IDS.has(id));
        const index = customIds.indexOf(shiftTypeId);
        if (index !== -1) return CUSTOM_SHIFT_TYPE_PALETTE[index % CUSTOM_SHIFT_TYPE_PALETTE.length]!;
      }
      let hash = 0;
      for (const char of shiftTypeId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
      return CUSTOM_SHIFT_TYPE_PALETTE[hash % CUSTOM_SHIFT_TYPE_PALETTE.length]!;
    }
  }
}
