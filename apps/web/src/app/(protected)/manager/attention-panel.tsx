'use client';

import { useState } from 'react';
import type { Lang } from '@/lib/demo/cafe/i18n';
import type { ManagerAttentionCategory, ManagerAttentionItem, ManagerAttentionQueueItem } from '@/lib/workforce/manager-attention';
import { ATTENTION_SEVERITY_BY_CATEGORY, computeManagerAttentionSummary } from '@/lib/workforce/manager-attention';
import { HelpIconButton, Modal } from '@/components/shared/design-kit';
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
 * Category-chip row: a flex row (not a fixed grid) so chips and "Review
 * all" sit together on one row when they fit -- Founder direction,
 * 2026-08-22, two rounds: first "chips and Review all should be in one row
 * on desktop", then "but on a 375px phone, 2 chips per row, Review all its
 * own full-width row below." Both come from the same flex-basis custom
 * properties (`globals.css`): `--attention-chip-basis` is `200px` on
 * desktop (content-sized, several fit per row) and `45%` at <=640px (two
 * fit, a third wraps); `--attention-reviewall-basis` is `auto` on desktop
 * (sits inline after the chips) and `100%` on mobile (nothing else fits
 * next to it once wrapped, so it fills its own row). No JS/breakpoint logic
 * here -- same technique `pageStyle()`'s `--page-padding` already uses.
 */
const chipRowStyle = {
  display: 'flex',
  flexWrap: 'wrap' as const,
  gap: 8,
  marginTop: 10,
};

/**
 * Single-line category chip, deliberately matched to `buttonSecondary`'s own
 * height/padding/radius (Attention polish pass, 2026-08-21: the previous
 * two-line stacked chip read as visually "heavier" than the EntryPointsCard
 * buttons directly above it) -- title and count sit side by side instead of
 * stacked, same tap height as every other secondary button in this page.
 */
const chipStyle = {
  ...buttonSecondary,
  flex: '1 1 var(--attention-chip-basis)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  cursor: 'pointer',
};

/** "Review all" is the row's primary action (not a category filter), pushed to the far right on desktop (where its basis is `auto` and the row has slack) and given the same green primary treatment as "+ Add recipe". On mobile its basis becomes `100%` (see `chipRowStyle`'s doc comment), which alone fills the wrapped line -- `marginLeft: auto` is then a no-op, not a conflict. */
const reviewAllButtonStyle = {
  ...buttonPrimary,
  flex: '0 1 var(--attention-reviewall-basis)',
  marginLeft: 'auto',
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

type Translate = (key: Parameters<typeof tManagerDashboard>[1]) => string;

/**
 * Manager Attention UX Compactness Correction (2026-08-21): the previous
 * pass (Manager Attention UX Reconciliation) made every category chip
 * consistent but also left a permanently-visible Level-3 item feed under
 * the chips, duplicating the same information the chips/counts already
 * summarize and pushing Weekly Schedule far down the page. This rewrite
 * keeps the Level 1 (total + require-action count) and Level 2 (category
 * chips) summary always visible, but Level 3 (concrete who/what/when
 * items) now only renders on demand, inside a popup -- either a single
 * category's popup (clicking that chip) or the consolidated "Review all"
 * popup (grouped by the same action-required/warning severity already
 * computed for the Level-1 summary, not a new classification).
 *
 * Corrections/Exchanges/Inventory chips are unchanged: they still open the
 * existing dedicated `CorrectionRequestsPopup`/`ShiftExchangeRequestsPopup`/
 * `InventoryPopup` (owned by the parent, passed down as callbacks) --
 * those already are the compact, decision-oriented per-category view the
 * mission asks for. Unavailable-conflict has no such dedicated popup yet
 * (it previously only linked to `#weekly-schedule`), so this component adds
 * a small self-contained one using the same `queueItems` data already
 * passed in -- no new fetch, no new business rule.
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
  const t: Translate = (key) => tManagerDashboard(lang, key);
  const [conflictsOpen, setConflictsOpen] = useState(false);
  const [reviewAllOpen, setReviewAllOpen] = useState(false);
  const [conflictsHelpOpen, setConflictsHelpOpen] = useState(false);
  const [reviewAllHelpOpen, setReviewAllHelpOpen] = useState(false);
  const summary = computeManagerAttentionSummary(items);

  function staffName(employeeId: string) {
    return staffNameById[employeeId] ?? employeeId;
  }

  function handleViewShiftAndClose(employeeId: string, workDate: string) {
    setConflictsOpen(false);
    setReviewAllOpen(false);
    onViewShift(employeeId, workDate);
  }

  function renderCorrectionItem(qi: Extract<ManagerAttentionQueueItem, { category: 'correction' }>) {
    return (
      <div key={qi.id} style={queueItemStyle}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{t('attentionItemCorrectionTitle')}</div>
          <div style={{ fontSize: 13 }}>{staffName(qi.employeeId)} · {qi.workDate}</div>
          <div style={{ ...mutedText, fontSize: 12 }}>{t('attentionWaitingDecision')}</div>
        </div>
        <button
          type="button"
          className={hoverStyles.buttonPrimary}
          style={{ ...buttonPrimary, padding: '6px 14px' }}
          onClick={() => {
            setReviewAllOpen(false);
            onOpenCorrections();
          }}
        >
          {t('attentionReview')}
        </button>
      </div>
    );
  }

  function renderExchangeItem(qi: Extract<ManagerAttentionQueueItem, { category: 'exchange' }>) {
    return (
      <div key={qi.id} style={queueItemStyle}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{t('attentionItemExchangeTitle')}</div>
          <div style={{ fontSize: 13 }}>{staffName(qi.employeeId)}{qi.workDate ? ` · ${qi.workDate}` : ''}</div>
          <div style={{ ...mutedText, fontSize: 12 }}>{qi.canApprove ? t('attentionWaitingDecision') : t('attentionReplacementNotSelected')}</div>
        </div>
        <button
          type="button"
          className={hoverStyles.buttonPrimary}
          style={{ ...buttonPrimary, padding: '6px 14px' }}
          onClick={() => {
            setReviewAllOpen(false);
            onOpenExchanges();
          }}
        >
          {t('attentionReview')}
        </button>
      </div>
    );
  }

  function renderConflictItem(qi: Extract<ManagerAttentionQueueItem, { category: 'unavailable_conflict' }>) {
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
          onClick={() => handleViewShiftAndClose(qi.employeeId, qi.workDate)}
        >
          {t('attentionViewShift')}
        </button>
      </div>
    );
  }

  function renderInventoryItem(qi: Extract<ManagerAttentionQueueItem, { category: 'inventory' }>) {
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
        <button
          type="button"
          className={hoverStyles.buttonSecondary}
          style={{ ...buttonSecondary, padding: '6px 14px' }}
          onClick={() => {
            setReviewAllOpen(false);
            onOpenInventory();
          }}
        >
          {t('attentionOpenInventory')}
        </button>
      </div>
    );
  }

  function renderQueueItem(qi: ManagerAttentionQueueItem) {
    if (qi.category === 'correction') return renderCorrectionItem(qi);
    if (qi.category === 'exchange') return renderExchangeItem(qi);
    if (qi.category === 'unavailable_conflict') return renderConflictItem(qi);
    return renderInventoryItem(qi);
  }

  const conflictItems = queueItems.filter((qi): qi is Extract<ManagerAttentionQueueItem, { category: 'unavailable_conflict' }> => qi.category === 'unavailable_conflict');
  const actionRequiredItems = queueItems.filter((qi) => ATTENTION_SEVERITY_BY_CATEGORY[qi.category] === 'action_required');
  const warningItems = queueItems.filter((qi) => ATTENTION_SEVERITY_BY_CATEGORY[qi.category] === 'warning');

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

          <div style={chipRowStyle}>
            {items.map((item) => {
              const label = (
                <>
                  <span style={{ fontSize: 14 }}>{t(ATTENTION_TITLE_KEY[item.category])}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: colors.warning }}>{item.count}</span>
                </>
              );
              const onClick =
                item.category === 'correction'
                  ? onOpenCorrections
                  : item.category === 'exchange'
                    ? onOpenExchanges
                    : item.category === 'inventory'
                      ? onOpenInventory
                      : () => setConflictsOpen(true);
              return (
                <button
                  key={item.category}
                  type="button"
                  className={hoverStyles.buttonSecondary}
                  aria-label={ATTENTION_FULL_LABEL[item.category](item.count, lang)}
                  style={chipStyle}
                  onClick={onClick}
                >
                  {label}
                </button>
              );
            })}
            <button type="button" className={hoverStyles.buttonPrimary} style={reviewAllButtonStyle} onClick={() => setReviewAllOpen(true)}>
              {t('attentionReviewAll')}
            </button>
          </div>
        </>
      )}

      <Modal
        open={conflictsOpen}
        onClose={() => setConflictsOpen(false)}
        title={t('attentionConflictsPopupTitle')}
        titleAdornment={<HelpIconButton ariaLabel={t('attentionConflictsPopupHelpAriaLabel')} onClick={() => setConflictsHelpOpen(true)} />}
        width="min(700px, 96vw)"
        closeLabel={t('cancel')}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{conflictItems.map((qi) => renderConflictItem(qi))}</div>
      </Modal>

      <Modal open={conflictsHelpOpen} onClose={() => setConflictsHelpOpen(false)} title={t('attentionConflictsPopupHelpTitle')} closeLabel={t('cancel')} width="min(480px, 94vw)">
        <div style={{ whiteSpace: 'pre-line' }}>{t('attentionConflictsPopupHelpBody')}</div>
      </Modal>

      <Modal
        open={reviewAllOpen}
        onClose={() => setReviewAllOpen(false)}
        title={t('attentionReviewAllTitle')}
        titleAdornment={<HelpIconButton ariaLabel={t('attentionReviewAllHelpAriaLabel')} onClick={() => setReviewAllHelpOpen(true)} />}
        width="min(760px, 96vw)"
        closeLabel={t('cancel')}
      >
        <p style={{ margin: 0, ...mutedText, fontSize: 13 }}>{attentionSummarySubtitle[lang](summary.actionRequiredCount, summary.warningCount)}</p>
        {actionRequiredItems.length > 0 ? (
          <div style={{ marginTop: 12 }}>
            <p style={{ margin: '0 0 8px', ...mutedText, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t('needsActionEyebrow')}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{actionRequiredItems.map((qi) => renderQueueItem(qi))}</div>
          </div>
        ) : null}
        {warningItems.length > 0 ? (
          <div style={{ marginTop: 16 }}>
            <p style={{ margin: '0 0 8px', ...mutedText, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t('attentionWarningsGroupHeading')}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{warningItems.map((qi) => renderQueueItem(qi))}</div>
          </div>
        ) : null}
      </Modal>

      <Modal open={reviewAllHelpOpen} onClose={() => setReviewAllHelpOpen(false)} title={t('attentionReviewAllHelpTitle')} closeLabel={t('cancel')} width="min(480px, 94vw)">
        <div style={{ whiteSpace: 'pre-line' }}>{t('attentionReviewAllHelpBody')}</div>
      </Modal>
    </section>
  );
}
