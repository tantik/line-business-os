import type { WorkforceShiftType } from '@/lib/workforce/shift-types';
import { card, demoColors, input, mutedText, shiftChipColors, shiftChipStyle } from '@/lib/demo/cafe/theme';
import { DemoHelpButton } from '@/components/demo/cafe/DemoHelpButton';
import { HELP_MANAGER_SETTINGS } from '@/lib/demo/cafe/helpContent';
import { WEEKDAY_LABELS_MON_FIRST } from '@/lib/demo/cafe/format';

/**
 * Demo/Preview manager UX parity: 設定 is a single compact card, like the
 * demo's `SettingsPanel`. Preview currently has no Server Action to
 * create/edit shift types or staffing requirements (`lib/preview/actions`
 * has no `shift-type-actions.ts`/settings module), so this renders the same
 * shift-type chip rows as `SettingsPanel`'s non-editing display state - never
 * a fake add/edit/delete control, and never a caveat about what's missing;
 * the row list alone reads as a normal, finished settings summary. Action-free
 * and not a client component, so it carries no Server Action risk.
 */
export interface PreviewSettingsCardProps {
  shiftTypes: WorkforceShiftType[] | null;
}

export function PreviewSettingsCard({ shiftTypes }: PreviewSettingsCardProps) {
  return (
    <section style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <strong style={{ fontSize: 16 }}>設定</strong>
        <DemoHelpButton content={HELP_MANAGER_SETTINGS} />
      </div>
      <div style={{ marginTop: 18 }}>
        <div style={{ fontSize: 13, color: demoColors.textMuted, marginBottom: 8 }}>必要人数（曜日ごと）</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 6 }}>
          {WEEKDAY_LABELS_MON_FIRST.map((label, weekday) => (
            <div key={label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: demoColors.textMuted, marginBottom: 4 }}>{label}</div>
              <input
                aria-label={`${label}曜日の必要人数`}
                readOnly
                value={[3, 3, 3, 3, 3, 2, 4][weekday]}
                style={{ ...input, textAlign: 'center', padding: '6px 4px' }}
              />
            </div>
          ))}
        </div>
      </div>
      <div style={{ marginTop: 18 }}>
        <label style={{ fontSize: 13, color: demoColors.textMuted }}>スタッフ最大勤務時間 / 月</label>
        <input aria-label="スタッフ最大勤務時間" readOnly value={160} style={{ ...input, display: 'block', maxWidth: 140 }} />
      </div>
      <div style={{ marginTop: 18 }}>
        <div style={{ fontSize: 13, color: demoColors.textMuted, marginBottom: 8 }}>シフト種別</div>
        {shiftTypes === null ? (
          <p style={{ margin: 0, ...mutedText }}>シフト種別を読み込めませんでした。</p>
        ) : shiftTypes.length === 0 ? (
          <p style={{ margin: 0, ...mutedText }}>シフト種別がまだ設定されていません。</p>
        ) : (
          <div style={{ display: 'grid', gap: 6 }}>
            {shiftTypes.map((st) => {
              const chip = shiftChipColors(st.shiftTypeId);
              const label = st.labelJa || st.labelEn || st.code;
              return (
                <div
                  key={st.shiftTypeId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 10px',
                    borderRadius: 8,
                    background: demoColors.surfaceElevated,
                  }}
                >
                  <span style={shiftChipStyle(chip.background, chip.color)}>{label}</span>
                  <span style={{ fontSize: 12, color: demoColors.textMuted }}>
                    {st.startsAtLocal} - {st.endsAtLocal}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
