'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Lang } from '@/lib/demo/cafe/i18n';
import type { ManagerAttentionCategory, ManagerAttentionItem, ManagerAttentionQueueItem } from '@/lib/workforce/manager-attention';
import { computeManagerAttentionSummary } from '@/lib/workforce/manager-attention';
import { buttonPrimary, buttonSecondary, card, colors, mutedText } from '@/lib/ui/theme';
import hoverStyles from '@/lib/ui/theme.module.css';
import {
  attentionCorrectionLabel,
  attentionExchangeLabel,
  attentionInventoryLabel,
  attentionInventoryShortageSummary,
  attentionSummarySubtitle,
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

const chipStyle = {
  flex: '1 1 140px',
  minWidth: 120,
  maxWidth: 220,
  textDecoration: 'none',
  color: colors.textPrimary,
  border: `1px solid ${colors.border}`,
  borderRadius: 8,
  padding: '8px 10px',
  background: colors.surfaceElevated,
  display: 'flex',
  flexDirection: 'column' as const,
  gap: 2,
  cursor: 'pointer',
  font: 'inherit',
  textAlign: 'left' as const,
};

const queueItemStyle = {
  border: `1px solid ${colors.border}`,
  borderRadius: 8,
  padding: '10px 12px',
  background: colors.surfaceElevated,
  display: 'flex',
  flexWrap: 'wrap' as const,
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
};

const MAX_VISIBLE_QUEUE_ITEMS = 5;

/**
 * Manager Attention UX Reconciliation (2026-08-21): replaces the previous
 * count-only card row with a three-level Action Queue --
 *
 * Level 1: total + "N require action / M warnings" summary
 *   (`computeManagerAttentionSummary`, `attentionSummarySubtitle`).
 * Level 2: the original per-category chips, now a consistent filter/summary
 *   row -- clicking any chip opens the same destination the mission's own
 *   §13 requires ("click category -> unified view for that category"):
 *   correction/exchange chips open their existing popups, inventory opens
 *   the existing `InventoryPopup` (previously this chip full-page-navigated
 *   to `/inventory` instead, the exact "Inventory opens its own workflow"
 *   inconsistency the mission's problem statement (§1) names), and
 *   unavailable-conflict still scrolls to the schedule grid (no single
 *   popup makes sense for an aggregate of conflicts across different
 *   dates).
 * Level 3: concrete "who/what/when" cards (`queueItems`, from
 *   `buildManagerAttentionQueue`) -- capped at `MAX_VISIBLE_QUEUE_ITEMS`,
 *   "View all N" expands in place (no new modal/framework, per §13/§14).
 *   Each item's own action button routes to the exact same canonical
 *   workflow the chip does for correction/exchange/inventory, or to
 *   `onViewShift` (schedule week/cell deep-link) for a conflict -- Attention
 *   still owns presentation only, no new approval/business logic.
 *
 * All business data (counts, queue items) is computed upstream by
 * `manager-attention.ts`'s pure functions from state the dashboard already
 * loads; this component only renders it.
 */
export function AttentionPanel({
  items,
  queueItems,
  lang,
  staffNameById,
  onOpenCorrections,
  onOpenExchanges,
  onOpenInventory,
  onViewShift,
}: {
  items: ManagerAttentionItem[];
  queueItems: ManagerAttentionQueueItem[];
  lang: Lang;
  staffNameById: Record<string, string>;
  onOpenCorrections: () => void;
  onOpenExchanges: () => void;
  onOpenInventory: () => void;
  onViewShift: (employeeId: string, workDate: string) => void;
}) {
  const t = (key: Parameters<typeof tManagerDashboard>[1]) => tManagerDashboard(lang, key);
  const [expanded, setExpanded] = useState(false);
  const summary = computeManagerAttentionSummary(items);
  const visibleQueueItems = expanded ? queueItems : queueItems.slice(0, MAX_VISIBLE_QUEUE_ITEMS);

  function staffName(employeeId: string) {
    return staffNameById[employeeId] ?? employeeId;
  }

  return (
    <section style={{ ...card, borderLeft: `3px solid ${items.length > 0 ? colors.warning : colors.success}` }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>{t('attentionHeading')}</h2>
        <span style={{ fontSize: 22, fontWeight: 700, color: items.length > 0 ? colors.warning : colors.success }}>{summary.total}</span>
      </div>

      {items.length === 0 ? (
        <p style={{ margin: '10px 0 0', ...mutedText }}>✓ {t('attentionAllClear')}</p>
      ) : (
        <>
          <p style={{ margin: '4px 0 0', ...mutedText, fontSize: 13 }}>{attentionSummarySubtitle[lang](summary.actionRequiredCount, summary.warningCount)}</p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
            {items.map((item) => {
              const label = (
                <>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{t(ATTENTION_TITLE_KEY[item.category])}</span>
                  <span style={{ fontSize: 18, fontWeight: 700, color: colors.warning }}>{item.count}</span>
                </>
              );
              if (item.category === 'correction' || item.category === 'exchange' || item.category === 'inventory') {
                const onClick = item.category === 'correction' ? onOpenCorrections : item.category === 'exchange' ? onOpenExchanges : onOpenInventory;
                return (
                  <button key={item.category} type="button" aria-label={ATTENTION_FULL_LABEL[item.category](item.count, lang)} style={chipStyle} onClick={onClick}>
                    {label}
                  </button>
                );
              }
              return (
                <Link
                  key={item.category}
                  href={ATTENTION_ANCHOR[item.category]}
                  aria-label={ATTENTION_FULL_LABEL[item.category](item.count, lang)}
                  style={chipStyle}
                >
                  {label}
                </Link>
              );
            })}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
            {visibleQueueItems.map((qi) => {
              if (qi.category === 'correction') {
                return (
                  <div key={qi.id} style={queueItemStyle}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{t('attentionItemCorrectionTitle')}</div>
                      <div style={{ fontSize: 13 }}>{staffName(qi.employeeId)} · {qi.workDate}</div>
                      <div style={{ ...mutedText, fontSize: 12 }}>{t('attentionWaitingDecision')}</div>
                    </div>
                    <button type="button" className={hoverStyles.buttonPrimary} style={{ ...buttonPrimary, padding: '6px 14px' }} onClick={onOpenCorrections}>
                      {t('attentionReview')}
                    </button>
                  </div>
                );
              }
              if (qi.category === 'exchange') {
                return (
                  <div key={qi.id} style={queueItemStyle}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{t('attentionItemExchangeTitle')}</div>
                      <div style={{ fontSize: 13 }}>{staffName(qi.employeeId)}{qi.workDate ? ` · ${qi.workDate}` : ''}</div>
                      <div style={{ ...mutedText, fontSize: 12 }}>{qi.canApprove ? t('attentionWaitingDecision') : t('attentionReplacementNotSelected')}</div>
                      {!qi.canApprove ? <div style={{ ...mutedText, fontSize: 12 }}>{t('attentionReplacementRequiredReason')}</div> : null}
                    </div>
                    <button type="button" className={hoverStyles.buttonPrimary} style={{ ...buttonPrimary, padding: '6px 14px' }} onClick={onOpenExchanges}>
                      {t('attentionReview')}
                    </button>
                  </div>
                );
              }
              if (qi.category === 'unavailable_conflict') {
                return (
                  <div key={qi.id} style={queueItemStyle}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{t('attentionItemConflictTitle')}</div>
                      <div style={{ fontSize: 13 }}>{staffName(qi.employeeId)} · {qi.workDate}</div>
                      <div style={{ ...mutedText, fontSize: 12 }}>{t('attentionConflictSummary')}</div>
                    </div>
                    <button
                      type="button"
                      className={hoverStyles.buttonSecondary}
                      style={{ ...buttonSecondary, padding: '6px 14px' }}
                      onClick={() => onViewShift(qi.employeeId, qi.workDate)}
                    >
                      {t('attentionViewShift')}
                    </button>
                  </div>
                );
              }
              // qi.category === 'inventory'
              return (
                <div key={qi.id} style={queueItemStyle}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{t('attentionItemInventoryTitle')}</div>
                    <div style={{ ...mutedText, fontSize: 12 }}>{attentionInventoryShortageSummary[lang](qi.shortageCount)}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4 }}>
                      {qi.topItems.map((it) => (
                        <div key={it.itemId} style={{ fontSize: 12 }}>
                          {it.name}: {it.actualQuantity ?? '-'} / {t('attentionTargetWord')} {it.requiredQuantity}
                        </div>
                      ))}
                    </div>
                  </div>
                  <button type="button" className={hoverStyles.buttonSecondary} style={{ ...buttonSecondary, padding: '6px 14px' }} onClick={onOpenInventory}>
                    {t('attentionOpenInventory')}
                  </button>
                </div>
              );
            })}
          </div>

          {queueItems.length > MAX_VISIBLE_QUEUE_ITEMS ? (
            <button
              type="button"
              className={hoverStyles.buttonSecondary}
              style={{ ...buttonSecondary, padding: '6px 14px', marginTop: 10 }}
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? t('attentionShowLess') : `${t('attentionViewAll')} ${queueItems.length}`}
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}
