'use client';

import { useLang } from '@/lib/demo/cafe/i18n';
import { badgeStyle, card, demoColors, mutedText } from '@/lib/demo/cafe/theme';

export interface PreviewManagerTodayProps {
  pendingCorrections: number;
  pendingExchanges: number;
  shortageItems: number;
  uncountedItems: number;
  unpublishedShifts: number;
  openingCheckComplete: boolean | null;
  closingCheckComplete: boolean | null;
  correctionDetails?: string[];
  shortageDetails?: string[];
}

export function PreviewManagerToday(props: PreviewManagerTodayProps) {
  const { lang } = useLang();
  const rows = [
    {
      key: 'corrections',
      active: props.pendingCorrections > 0,
      title: lang === 'ja' ? '勤怠修正' : 'Attendance corrections',
      detail:
        lang === 'ja'
          ? props.correctionDetails?.join('、') || `${props.pendingCorrections}件の確認待ち`
          : props.correctionDetails?.join(', ') || `${props.pendingCorrections} awaiting review`,
    },
    {
      key: 'exchanges',
      active: props.pendingExchanges > 0,
      title: lang === 'ja' ? 'シフト交換' : 'Shift exchanges',
      detail:
        lang === 'ja'
          ? `シフト交換の確認: ${props.pendingExchanges}件`
          : `Shift exchanges awaiting review: ${props.pendingExchanges}`,
    },
    {
      key: 'schedule',
      active: props.unpublishedShifts > 0,
      title: lang === 'ja' ? '未公開シフト' : 'Unpublished shifts',
      detail:
        lang === 'ja'
          ? `未公開のシフト変更: ${props.unpublishedShifts}件`
          : `Unpublished schedule changes: ${props.unpublishedShifts}`,
    },
    {
      key: 'shortage',
      active: props.shortageItems > 0,
      title: lang === 'ja' ? '在庫不足' : 'Inventory shortage',
      detail:
        lang === 'ja'
          ? props.shortageDetails?.join('、') || `${props.shortageItems}件の商品が要補充`
          : props.shortageDetails?.join(', ') || `${props.shortageItems} item(s) need restocking`,
    },
    {
      key: 'uncounted',
      active: props.uncountedItems > 0,
      title: lang === 'ja' ? '未確認在庫' : 'Uncounted inventory',
      detail:
        lang === 'ja'
          ? `未確認の在庫: ${props.uncountedItems}件`
          : `Inventory items not yet counted: ${props.uncountedItems}`,
    },
    {
      key: 'opening',
      active: props.openingCheckComplete === false,
      title: lang === 'ja' ? '開始在庫確認' : 'Opening stock check',
      detail: lang === 'ja' ? '本日の確認が未完了です' : "Today's check is incomplete",
    },
    {
      key: 'closing',
      active: props.closingCheckComplete === false,
      title: lang === 'ja' ? '終了在庫確認' : 'Closing stock check',
      detail: lang === 'ja' ? '本日の確認が未完了です' : "Today's check is incomplete",
    },
  ].filter((row) => row.active);

  return (
    <section style={{ ...card, marginTop: 18, borderColor: rows.length > 0 ? demoColors.warning : demoColors.border }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 17 }}>{lang === 'ja' ? '今日の確認事項' : 'Today / Requires attention'}</h2>
          <p style={{ ...mutedText, margin: '4px 0 0', fontSize: 12 }}>
            {lang === 'ja' ? '対応が必要な項目を一か所で確認できます。' : 'All operational exceptions in one place.'}
          </p>
        </div>
        <span style={badgeStyle(rows.length > 0 ? 'warning' : 'active')}>
          {rows.length > 0
            ? lang === 'ja'
              ? `${rows.length}項目`
              : `${rows.length} item(s)`
            : lang === 'ja'
              ? '問題なし'
              : 'All clear'}
        </span>
      </div>
      {rows.length > 0 ? (
        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
          {rows.map((row) => (
            <div key={row.key} style={{ padding: '10px 12px', borderRadius: 8, background: demoColors.alertWarningBg, border: `1px solid ${demoColors.warning}` }}>
              <strong style={{ display: 'block', fontSize: 12.5 }}>{row.title}</strong>
              <span style={{ display: 'block', marginTop: 3, fontSize: 12, color: demoColors.textMuted }}>{row.detail}</span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
