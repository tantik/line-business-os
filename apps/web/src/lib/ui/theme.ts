import type { CSSProperties } from 'react';

/**
 * Shared dark UI tokens/style helpers for apps/web.
 *
 * Visual foundation only — no component logic. Centralizing colors here
 * avoids repeating magic hex values across pages while keeping every page a
 * plain server component with inline styles (no new styling dependency).
 */

export const colors = {
  bg: '#0B1220',
  surface: '#151C2E',
  surfaceElevated: '#172033',
  border: '#243041',
  textPrimary: '#E5E7EB',
  textMuted: '#9CA3AF',
  accent: '#06C755',
  accentMuted: 'rgba(6, 199, 85, 0.12)',
  danger: '#F87171',
  dangerMuted: 'rgba(248, 113, 113, 0.12)',
  dangerText: '#FCA5A5',
  success: '#34D399',
  successMuted: 'rgba(52, 211, 153, 0.12)',
  warning: '#FBBF24',
} as const;

export function pageStyle(maxWidth: number): CSSProperties {
  return { maxWidth, margin: '0 auto', padding: 32 };
}

export const card: CSSProperties = {
  border: `1px solid ${colors.border}`,
  borderRadius: 12,
  padding: 16,
  marginTop: 16,
  background: colors.surface,
};

export const mutedText: CSSProperties = { color: colors.textMuted };

export const buttonPrimary: CSSProperties = {
  padding: '10px 16px',
  background: colors.accent,
  color: colors.bg,
  border: 'none',
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
};

export const buttonSecondary: CSSProperties = {
  padding: '8px 14px',
  background: colors.surfaceElevated,
  color: colors.textPrimary,
  border: `1px solid ${colors.border}`,
  borderRadius: 8,
  fontSize: 14,
  cursor: 'pointer',
};

export const buttonDisabled: CSSProperties = {
  padding: '8px 12px',
  background: colors.surface,
  color: colors.textMuted,
  border: `1px solid ${colors.border}`,
  borderRadius: 8,
  fontSize: 14,
  cursor: 'not-allowed',
};

export const linkAccent: CSSProperties = {
  color: colors.accent,
  textDecoration: 'none',
};

export const input: CSSProperties = {
  display: 'block',
  width: '100%',
  marginTop: 4,
  padding: '10px 12px',
  background: colors.surfaceElevated,
  border: `1px solid ${colors.border}`,
  borderRadius: 8,
  color: colors.textPrimary,
  fontSize: 14,
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
  };
}
