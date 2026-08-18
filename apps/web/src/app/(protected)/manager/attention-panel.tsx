import Link from 'next/link';
import type { Lang } from '@/lib/demo/cafe/i18n';
import type { ManagerAttentionCategory, ManagerAttentionItem } from '@/lib/workforce/manager-attention';
import { card, colors, mutedText } from '@/lib/ui/theme';
import {
  attentionCorrectionLabel,
  attentionExchangeLabel,
  attentionInventoryLabel,
  attentionUnavailableConflictLabel,
  tManagerDashboard,
} from './manager-dashboard-i18n';

const ATTENTION_ANCHOR: Record<ManagerAttentionCategory, string> = {
  correction: '#correction-requests',
  exchange: '#shift-exchange-requests',
  unavailable_conflict: '#weekly-schedule',
  inventory: '/inventory',
};

const ATTENTION_TITLE_KEY: Record<ManagerAttentionCategory, 'attentionCorrectionTitle' | 'attentionExchangeTitle' | 'attentionUnavailableConflictTitle' | 'attentionInventoryTitle'> = {
  correction: 'attentionCorrectionTitle',
  exchange: 'attentionExchangeTitle',
  unavailable_conflict: 'attentionUnavailableConflictTitle',
  inventory: 'attentionInventoryTitle',
};

const ATTENTION_FULL_LABEL: Record<ManagerAttentionCategory, (count: number, lang: Lang) => string> = {
  correction: (count, lang) => attentionCorrectionLabel[lang](count),
  exchange: (count, lang) => attentionExchangeLabel[lang](count),
  unavailable_conflict: (count, lang) => attentionUnavailableConflictLabel[lang](count),
  inventory: (count, lang) => attentionInventoryLabel[lang](count),
};

/**
 * Compact, fixed-size row of attention trigger cards (one per non-empty
 * category), replacing the previous vertically-growing list -- matches the
 * old Mame To Cha prototype's "Today / Requires attention" row (Founder
 * spec, Cafe Manager parity mission, 2026-08-18). `computeManagerAttention`
 * already omits zero-count categories, so this component never needs its
 * own empty-item filtering.
 *
 * Each card still links to the same anchor/route the previous list did
 * (`#correction-requests`, `#shift-exchange-requests`, `#weekly-schedule`,
 * `/inventory`) -- relocating that content into a popup (as the full parity
 * spec eventually wants) is deliberately deferred to a later WP, not bundled
 * into this visual-only change.
 */
export function AttentionPanel({ items, lang }: { items: ManagerAttentionItem[]; lang: Lang }) {
  const t = (key: Parameters<typeof tManagerDashboard>[1]) => tManagerDashboard(lang, key);

  return (
    <section style={{ ...card, borderLeft: `3px solid ${items.length > 0 ? colors.warning : colors.success}` }}>
      <h2 style={{ margin: 0, fontSize: 16 }}>{t('attentionHeading')}</h2>
      {items.length === 0 ? (
        <p style={{ margin: '10px 0 0', ...mutedText }}>{t('attentionAllClear')}</p>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 10 }}>
          {items.map((item) => (
            <Link
              key={item.category}
              href={ATTENTION_ANCHOR[item.category]}
              aria-label={ATTENTION_FULL_LABEL[item.category](item.count, lang)}
              style={{
                flex: '1 1 160px',
                minWidth: 160,
                maxWidth: 260,
                textDecoration: 'none',
                color: colors.textPrimary,
                border: `1px solid ${colors.border}`,
                borderRadius: 8,
                padding: '10px 12px',
                background: colors.surfaceElevated,
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                minHeight: 64,
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 600 }}>{t(ATTENTION_TITLE_KEY[item.category])}</span>
              <span style={{ fontSize: 20, fontWeight: 700, color: colors.warning }}>{item.count}</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
