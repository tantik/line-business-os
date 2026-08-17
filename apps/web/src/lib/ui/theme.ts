import type { CSSProperties } from 'react';

/**
 * Shared UI tokens/style helpers for apps/web.
 *
 * Visual foundation only — no component logic. Centralizing colors here
 * avoids repeating magic hex values across pages while keeping every page a
 * plain server component with inline styles (no new styling dependency).
 *
 * Warm/light palette (Cafe Commercial Launch Readiness, visual/brand
 * reconciliation, Founder decision 2026-08-16): values are ported 1:1 from
 * `@/lib/demo/cafe/theme.ts`'s `demoColors` (the Surface A / public-demo
 * reference the Founder approved as the canonical visual direction), not
 * reinvented. The two token files stay structurally separate by design (each
 * surface remains independently themeable) but now share the same palette,
 * so the canonical Manager/Staff/Inventory/Admin/Recipes dashboards read as
 * one commercial product with the reference surface instead of a plain dark
 * admin panel next to a warm consumer-facing demo.
 */

export const colors = {
  bg: '#FAF3E7',
  surface: '#FFFFFF',
  surfaceElevated: '#F6EEDF',
  border: '#E7D9C1',
  textPrimary: '#362B1F',
  textMuted: '#8B7C64',
  accent: '#4F7A52',
  accentMuted: 'rgba(79, 122, 82, 0.12)',
  danger: '#C1503F',
  dangerMuted: 'rgba(193, 80, 63, 0.12)',
  dangerText: '#A6402F',
  success: '#4F7A52',
  successMuted: 'rgba(79, 122, 82, 0.12)',
  warning: '#B8863B',
} as const;

export function pageStyle(maxWidth: number): CSSProperties {
  return { maxWidth, margin: '0 auto', padding: 32 };
}

export const card: CSSProperties = {
  border: `1px solid ${colors.border}`,
  borderRadius: 8,
  padding: 18,
  marginTop: 16,
  background: colors.surface,
  boxShadow: '0 1px 2px rgba(54, 43, 31, 0.04), 0 10px 24px rgba(54, 43, 31, 0.05)',
};

export const mutedText: CSSProperties = { color: colors.textMuted };

/** WCAG 2.5.5 / mobile touch-target minimum (44x44 CSS px) shared by every clickable control below. */
export const minTouchTarget = 44;

/**
 * `whiteSpace: 'nowrap'` + `flexShrink: 0` on every button style below is
 * load-bearing, not decoration: a button placed in a `display: flex` row
 * (headers, Attention-panel rows, table-cell action groups) otherwise
 * shrinks to its min-content width under space pressure, and since CJK text
 * has no word boundaries, that min-content width can be a single character
 * -- collapsing "サインアウト"/"確認する" into an unreadable vertical
 * one-character-per-line stack at narrow (mobile) widths. Cafe v2.1
 * hardening mobile-parity audit, 2026-08-17.
 */
export const buttonPrimary: CSSProperties = {
  minHeight: minTouchTarget,
  padding: '10px 16px',
  background: colors.accent,
  color: '#FFFFFF',
  border: 'none',
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  flexShrink: 0,
};

export const buttonSecondary: CSSProperties = {
  minHeight: minTouchTarget,
  padding: '8px 14px',
  background: colors.surface,
  color: colors.textPrimary,
  border: `1px solid ${colors.border}`,
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  flexShrink: 0,
};

export const buttonDisabled: CSSProperties = {
  minHeight: minTouchTarget,
  padding: '8px 12px',
  background: colors.surfaceElevated,
  color: colors.textMuted,
  border: `1px solid ${colors.border}`,
  borderRadius: 8,
  fontSize: 14,
  cursor: 'not-allowed',
  whiteSpace: 'nowrap',
  flexShrink: 0,
};

export const linkAccent: CSSProperties = {
  color: colors.accent,
  textDecoration: 'none',
};

export const input: CSSProperties = {
  display: 'block',
  width: '100%',
  boxSizing: 'border-box',
  minHeight: minTouchTarget,
  marginTop: 4,
  padding: '10px 12px',
  background: colors.surface,
  border: `1px solid ${colors.border}`,
  borderRadius: 8,
  color: colors.textPrimary,
  fontSize: 14,
};

/** Larger visible checkbox + a full min-touch-target clickable row (wrap in a <label>). */
export const checkboxInput: CSSProperties = { width: 20, height: 20, cursor: 'pointer', flexShrink: 0 };

export const checkboxLabel: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  minHeight: minTouchTarget,
  cursor: 'pointer',
};

export const alertDanger: CSSProperties = {
  border: `1px solid ${colors.danger}`,
  background: colors.dangerMuted,
  color: colors.dangerText,
  borderRadius: 8,
  padding: '8px 12px',
  fontSize: 14,
};

export const tableHeaderCell: CSSProperties = {
  borderBottom: `1px solid ${colors.border}`,
  padding: '8px 10px',
  color: colors.textMuted,
};

export const tableCell: CSSProperties = {
  borderBottom: `1px solid ${colors.border}`,
  padding: '10px',
};

export type BadgeTone = 'active' | 'inactive' | 'neutral' | 'warning';

export function badgeStyle(tone: BadgeTone): CSSProperties {
  const tones: Record<BadgeTone, { background: string; color: string; border: string }> = {
    active: { background: colors.successMuted, color: colors.success, border: colors.success },
    inactive: { background: colors.surfaceElevated, color: colors.textMuted, border: colors.border },
    neutral: { background: colors.accentMuted, color: colors.accent, border: colors.accent },
    warning: { background: colors.dangerMuted, color: colors.dangerText, border: colors.danger },
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
    whiteSpace: 'nowrap',
  };
}
