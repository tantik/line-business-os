'use client';

import { useLang } from '@/lib/demo/cafe/i18n';
import { badgeStyle, card, demoColors, mutedText } from '@/lib/demo/cafe/theme';

export interface PreviewManagerTodayProps {
  pendingCorrections: number;
  pendingExchanges: number;
  shortageItems: number;
  uncountedItems: number;
  unpublishedShifts: number;
  staleRecipeFields: number;
  openingCheckComplete: boolean | null;
  closingCheckComplete: boolean | null;
}

export function PreviewManagerToday(props: PreviewManagerTodayProps) {
  const { lang } = useLang();
  const rows = [
    {
      key: 'corrections',
      active: props.pendingCorrections > 0,
      label:
        lang === 'ja'
          ? `勤怠修正の確認: ${props.pendingCorrections}件`
          : `Attendance corrections: ${props.pendingCorrections}`,
    },
    {
      key: 'exchanges',
      active: props.pendingExchanges > 0,
      label:
        lang === 'ja'
          ? `シフト交換の確認: ${props.pendingExchanges}件`
          : `Shift exchanges awaiting review: ${props.pendingExchanges}`,
    },
    {
      key: 'schedule',
      active: props.unpublishedShifts > 0,
      label:
        lang === 'ja'
          ? `未公開のシフト変更: ${props.unpublishedShifts}件`
          : `Unpublished schedule changes: ${props.unpublishedShifts}`,
    },
    {
      key: 'shortage',
      active: props.shortageItems > 0,
      label:
        lang === 'ja'
          ? `補充が必要な商品: ${props.shortageItems}件`
          : `Items needing restock: ${props.shortageItems}`,
    },
    {
      key: 'uncounted',
      active: props.uncountedItems > 0,
      label:
        lang === 'ja'
          ? `未確認の在庫: ${props.uncountedItems}件`
          : `Inventory items not yet counted: ${props.uncountedItems}`,
    },
    {
      key: 'translations',
      active: props.staleRecipeFields > 0,
      label:
        lang === 'ja'
          ? `更新が必要な英訳: ${props.staleRecipeFields}件`
          : `Recipe translations needing update: ${props.staleRecipeFields}`,
    },
    {
      key: 'opening',
      active: props.openingCheckComplete === false,
      label: lang === 'ja' ? '本日の開始在庫確認が未完了です' : "Today's opening stock check is incomplete",
    },
    {
      key: 'closing',
      active: props.closingCheckComplete === false,
      label: lang === 'ja' ? '本日の終了在庫確認が未完了です' : "Today's closing stock check is incomplete",
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
        <ul style={{ margin: '12px 0 0', paddingLeft: 20, display: 'grid', gap: 7, fontSize: 13 }}>
          {rows.map((row) => (
            <li key={row.key}>{row.label}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
