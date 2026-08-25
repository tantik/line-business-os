'use client';

import type { ShiftTypeDef } from '@/lib/demo/cafe/types';
import { demoColors, shiftChipColors, shiftChipStyle } from '@/lib/demo/cafe/theme';
import type { Lang } from '@/lib/demo/cafe/i18n';
import { tStaff } from '@/lib/demo/cafe/i18n.staff';

interface ShiftLegendProps {
  shiftTypes: ShiftTypeDef[];
  lang: Lang;
  /**
   * Renders each chip's badge as its 1-based display-order index (e.g.
   * "3") instead of its full label -- pairs with `ShiftTable`'s own
   * `compact` mode, which switches its grid cells to the same short
   * numeric badge so a full time-range label doesn't overflow a ~375px
   * mobile cell (Founder Preview QA, 2026-08-25). The adjacent text still
   * always shows the real label/time range, so a staff member can look up
   * what "3" means (format: `[3] 13:00-18:00`). Defaults to `false` --
   * every existing caller (Manager, preview surfaces) is unaffected unless
   * it explicitly opts in. Same index ordering as `ShiftTable` (both index
   * the same `shiftTypes` array position), so cell "3" and legend "[3]"
   * always refer to the same shift type.
   */
  numbered?: boolean;
}

/** Compact legend explaining shift-chip colors/times, driven by the live shift-type data (never hardcoded times). */
export function ShiftLegend({ shiftTypes, lang, numbered = false }: ShiftLegendProps) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px' }}>
      {shiftTypes.map((type, index) => {
        const chip = shiftChipColors(type.id, shiftTypes.map((t) => t.id));
        const hasOwnTimeRange = type.startTime && type.endTime && !type.label.includes(type.startTime);
        const badgeLabel = numbered ? String(index + 1) : type.label;
        return (
          <div key={type.id} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={shiftChipStyle(chip.background, chip.color, true)}>{badgeLabel}</span>
            <span style={{ fontSize: 11, color: demoColors.textMuted }}>
              {hasOwnTimeRange ? `${type.startTime}-${type.endTime}` : type.label}
            </span>
          </div>
        );
      })}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={shiftChipStyle(shiftChipColors(null).background, shiftChipColors(null).color, true)}>－</span>
        <span style={{ fontSize: 11, color: demoColors.textMuted }}>{tStaff(lang, 'notScheduled')}</span>
      </div>
    </div>
  );
}
