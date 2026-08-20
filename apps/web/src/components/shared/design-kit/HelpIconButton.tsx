'use client';

import { colors } from '@/lib/ui/theme';
import hoverStyles from '@/lib/ui/theme.module.css';

const helpIconButtonStyle = {
  width: 24,
  height: 24,
  borderRadius: 999,
  border: `1px solid ${colors.border}`,
  background: colors.surfaceElevated,
  color: colors.textPrimary,
  fontSize: 13,
  lineHeight: 1,
  cursor: 'pointer',
  flexShrink: 0,
} as const;

export interface HelpIconButtonProps {
  ariaLabel: string;
  onClick: () => void;
}

/**
 * Shared "?" info button that opens a help `Modal` -- the one bordered-circle
 * style every section-help affordance should use (Cafe Manager UI/UX Parity
 * mission, WP-9). Before this, the schedule/labour-cost section already used
 * this exact bordered-circle look inline (`helpButtonStyle` in
 * `manager-dashboard-client.tsx`) while Settings used a divergent
 * transparent/no-border style -- both now render through this one component.
 */
export function HelpIconButton({ ariaLabel, onClick }: HelpIconButtonProps) {
  return (
    <button type="button" className={hoverStyles.iconButton} aria-label={ariaLabel} onClick={onClick} style={helpIconButtonStyle}>
      ?
    </button>
  );
}
