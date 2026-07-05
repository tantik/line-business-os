import type { ShiftTypeDef } from '@/lib/demo/cafe/types';
import { demoColors, shiftChipColors, shiftChipStyle } from '@/lib/demo/cafe/theme';
import type { Lang } from '@/lib/demo/cafe/i18n';
import { tStaff } from '@/lib/demo/cafe/i18n.staff';

interface ShiftLegendProps {
  shiftTypes: ShiftTypeDef[];
  lang: Lang;
}

/** Compact legend explaining shift-chip colors/times, driven by the live shift-type data (never hardcoded times). */
export function ShiftLegend({ shiftTypes, lang }: ShiftLegendProps) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px' }}>
      {shiftTypes.map((type) => {
        const chip = shiftChipColors(type.id);
        const hasOwnTimeRange = type.startTime && type.endTime && !type.label.includes(type.startTime);
        return (
          <div key={type.id} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={shiftChipStyle(chip.background, chip.color, true)}>{type.label}</span>
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
