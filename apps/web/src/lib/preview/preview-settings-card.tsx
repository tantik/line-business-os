import type { WorkforceShiftType } from '@/lib/workforce/shift-types';
import { card, mutedText, tableCell, tableHeaderCell } from '@/lib/demo/cafe/theme';

/**
 * Demo/Preview manager UX parity: 設定 is a single compact card, like the
 * demo's `SettingsPanel`. Preview currently has no Server Action to
 * create/edit shift types or staffing requirements (`lib/preview/actions`
 * has no `shift-type-actions.ts`/settings module) - rather than fake a
 * working control, this shows the real shift-type data read-only with an
 * explicit note, per the "don't create a fake button" requirement. Action-free
 * and not a client component, so it carries no Server Action risk.
 */
export interface PreviewSettingsCardProps {
  shiftTypes: WorkforceShiftType[] | null;
}

export function PreviewSettingsCard({ shiftTypes }: PreviewSettingsCardProps) {
  return (
    <section style={card}>
      <strong style={{ fontSize: 16 }}>設定</strong>
      <p style={{ margin: '8px 0 0', fontSize: 12.5, ...mutedText }}>
        シフト種別（現在は表示のみ。追加・編集は今後対応予定です）
      </p>
      {shiftTypes === null ? (
        <p style={{ margin: '8px 0 0', ...mutedText }}>シフト種別を読み込めませんでした。</p>
      ) : shiftTypes.length === 0 ? (
        <p style={{ margin: '8px 0 0', ...mutedText }}>シフト種別がまだ設定されていません。</p>
      ) : (
        <table style={{ width: '100%', marginTop: 10, borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ ...tableHeaderCell, textAlign: 'left' }}>コード</th>
              <th style={{ ...tableHeaderCell, textAlign: 'left' }}>名称</th>
              <th style={{ ...tableHeaderCell, textAlign: 'left' }}>時間</th>
              <th style={{ ...tableHeaderCell, textAlign: 'left' }}>休憩</th>
            </tr>
          </thead>
          <tbody>
            {shiftTypes.map((st) => (
              <tr key={st.shiftTypeId}>
                <td style={tableCell}>{st.code}</td>
                <td style={tableCell}>{st.labelJa || st.labelEn || '-'}</td>
                <td style={tableCell}>
                  {st.startsAtLocal} - {st.endsAtLocal}
                </td>
                <td style={tableCell}>{st.breakMinutes} 分</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
