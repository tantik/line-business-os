'use client';

import { useEffect, useState, useTransition } from 'react';
import type { ReactNode } from 'react';
import type { Lang } from '@/lib/demo/cafe/i18n';
import { getWeeklyReviewAction } from '@/lib/weekly-review/weekly-review-actions';
import type { WeeklyReviewWeek } from '@/lib/weekly-review/weekly-review-actions';
import type { WeeklyReviewRecurringCategory, WeeklyReviewSummary } from '@/lib/weekly-review/weekly-review';
import { formatWeekRangeLabel } from '@/lib/weekly-review/week-label';
import { Button, EmptyState, InlineAlert, ListRow, MetadataText, SkeletonLines, StatusBadge } from '@line-os/ui';
import type { tWeeklyReview } from './weekly-review-i18n';

type TFn = (key: Parameters<typeof tWeeklyReview>[1]) => string;

const CATEGORY_LABEL_KEY: Record<string, Parameters<typeof tWeeklyReview>[1]> = {
  equipment: 'categoryEquipment',
  inventory: 'categoryInventory',
  cleaning: 'categoryCleaning',
  facility: 'categoryFacility',
  customer: 'categoryCustomer',
  operations: 'categoryOperations',
  other: 'categoryOther',
};

export interface WeeklyReviewDrillDownHandlers {
  onOpenShiftRequests: () => void;
  onOpenShiftExchanges: () => void;
  onOpenOperations: () => void;
  onOpenIssues: () => void;
  onOpenPurchases: () => void;
  onOpenInventoryShortage: () => void;
}

export interface WeeklyReviewManagerBodyProps extends WeeklyReviewDrillDownHandlers {
  t: TFn;
  lang: Lang;
  /** Re-fetch trigger -- bumping this (e.g. when the popup is (re)opened) forces a fresh read of the current week offset. */
  open: boolean;
}

const DEFAULT_WEEK_OFFSET = -1;

/**
 * Owner Weekly Review Manager body (Cafe v2.2 WP3). Fetches its own data via
 * a `'use server'` action (`getWeeklyReviewAction`) rather than server page
 * props -- see that action's doc comment for why. Renders four read-only
 * sections (Team/Operations/Issues/Purchasing) plus a compact "Still open"
 * rollup, a dedicated quiet-week empty state, and Prev/Next week navigation
 * (no date picker, per the mission contract).
 */
export function WeeklyReviewManagerBody({
  t,
  lang,
  open,
  onOpenShiftRequests,
  onOpenShiftExchanges,
  onOpenOperations,
  onOpenIssues,
  onOpenPurchases,
  onOpenInventoryShortage,
}: WeeklyReviewManagerBodyProps) {
  const [weekOffset, setWeekOffset] = useState(DEFAULT_WEEK_OFFSET);
  const [week, setWeek] = useState<WeeklyReviewWeek | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    setError(null);
    startTransition(async () => {
      const result = await getWeeklyReviewAction(weekOffset);
      if (result.status === 'success') {
        setWeek(result.data);
      } else {
        setError(t('unavailable'));
      }
    });
  }, [open, weekOffset]);

  if (!open) return null;

  const summary = week?.summary ?? null;
  const isQuietWeek =
    summary !== null &&
    (summary.operations === null || (summary.operations.criticalMissedCount === 0 && summary.operations.openExceptionsCount === 0)) &&
    (summary.issues === null || (summary.issues.unresolvedIssuesCount === 0 && summary.issues.newIssuesCount === 0 && summary.issues.newHandoversCount === 0)) &&
    (summary.purchasing === null || (summary.purchasing.pendingPurchasesCount === 0 && summary.purchasing.shortageItemsCount === 0)) &&
    (summary.workforce === null || summary.workforce.unresolvedShiftRequestsCount === 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setWeekOffset((o) => o - 1)} disabled={isPending}>
            {'‹'} {t('prevWeek')}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setWeekOffset((o) => Math.min(0, o + 1))} disabled={isPending || weekOffset >= 0}>
            {t('nextWeek')} {'›'}
          </Button>
        </div>
        {week ? (
          <div className="flex items-center gap-2">
            <strong className="text-base font-medium text-text-primary">{formatWeekRangeLabel(lang, week.periodStart, week.periodEnd)}</strong>
            {week.isInProgress ? <StatusBadge tone="neutral" showIcon={false}>{t('inProgressBadge')}</StatusBadge> : null}
          </div>
        ) : null}
      </div>

      {isPending && !week ? (
        <SkeletonLines lines={4} label={t('popupTitle')} />
      ) : error ? (
        <InlineAlert tone="critical">{error}</InlineAlert>
      ) : !summary ? null : isQuietWeek ? (
        <EmptyState title={t('quietWeekTitle')} description={t('quietWeekDescription')} />
      ) : (
        <div className="flex flex-col gap-4">
          <TeamSection t={t} summary={summary} onOpenShiftRequests={onOpenShiftRequests} onOpenShiftExchanges={onOpenShiftExchanges} />
          <OperationsSection t={t} summary={summary} onOpenOperations={onOpenOperations} />
          <IssuesSection t={t} summary={summary} onOpenIssues={onOpenIssues} />
          <PurchasingSection t={t} summary={summary} onOpenPurchases={onOpenPurchases} onOpenInventoryShortage={onOpenInventoryShortage} />
          <StillOpenSection
            t={t}
            summary={summary}
            onOpenOperations={onOpenOperations}
            onOpenIssues={onOpenIssues}
            onOpenPurchases={onOpenPurchases}
          />
        </div>
      )}
    </div>
  );
}

interface SectionProps {
  t: TFn;
  summary: WeeklyReviewSummary;
}

function SectionCard({
  title,
  children,
  notAvailable,
  notAvailableLabel,
}: {
  title: string;
  children: ReactNode;
  notAvailable: boolean;
  notAvailableLabel: string;
}) {
  return (
    <div className="rounded-md border border-border bg-surface p-3 shadow-card">
      <h3 className="m-0 mb-2 text-sm font-semibold text-text-primary">{title}</h3>
      {notAvailable ? <MetadataText>{notAvailableLabel}</MetadataText> : children}
    </div>
  );
}

/** One label+count row, optionally clickable through to the owning module's real popup (drill-down). Built on `ListRow`'s real `title`/`status`/`onOpen` contract -- not a generic children container. */
function MetricRow({ label, count, onOpen }: { label: string; count: number; onOpen?: () => void }) {
  return <ListRow title={<MetadataText>{label}</MetadataText>} status={<strong className="text-base font-medium text-text-primary">{count}</strong>} onOpen={onOpen} />;
}

function TeamSection({
  t,
  summary,
  onOpenShiftRequests,
  onOpenShiftExchanges,
}: SectionProps & Pick<WeeklyReviewDrillDownHandlers, 'onOpenShiftRequests' | 'onOpenShiftExchanges'>) {
  const wf = summary.workforce;
  return (
    <SectionCard title={t('sectionTeam')} notAvailable={wf === null} notAvailableLabel={t('notAvailableModuleOff')}>
      {wf ? (
        <div className="flex flex-col gap-1.5">
          <MetricRow label={t('labelShiftAssignments')} count={wf.shiftAssignmentsCount} />
          <MetricRow label={t('labelShiftExchanges')} count={wf.shiftExchangesCount} onOpen={onOpenShiftExchanges} />
          <MetricRow label={t('labelUnresolvedShiftRequests')} count={wf.unresolvedShiftRequestsCount} onOpen={onOpenShiftRequests} />
        </div>
      ) : null}
    </SectionCard>
  );
}

function OperationsSection({ t, summary, onOpenOperations }: SectionProps & Pick<WeeklyReviewDrillDownHandlers, 'onOpenOperations'>) {
  const ops = summary.operations;
  return (
    <SectionCard title={t('sectionOperations')} notAvailable={ops === null} notAvailableLabel={t('notAvailableModuleOff')}>
      {ops ? (
        <div className="flex flex-col gap-1.5">
          <MetricRow label={t('labelCompletedChecks')} count={ops.completedCount} />
          <MetricRow label={t('labelCriticalMissed')} count={ops.criticalMissedCount} onOpen={onOpenOperations} />
          <MetricRow label={t('labelOpenExceptions')} count={ops.openExceptionsCount} onOpen={onOpenOperations} />
        </div>
      ) : null}
    </SectionCard>
  );
}

function IssuesSection({ t, summary, onOpenIssues }: SectionProps & Pick<WeeklyReviewDrillDownHandlers, 'onOpenIssues'>) {
  const issues = summary.issues;
  return (
    <SectionCard title={t('sectionIssues')} notAvailable={issues === null} notAvailableLabel={t('notAvailableModuleOff')}>
      {issues ? (
        <div className="flex flex-col gap-1.5">
          <MetricRow label={t('labelNewIssues')} count={issues.newIssuesCount} onOpen={onOpenIssues} />
          <MetricRow label={t('labelNewHandovers')} count={issues.newHandoversCount} onOpen={onOpenIssues} />
          <MetricRow label={t('labelUnresolvedIssues')} count={issues.unresolvedIssuesCount} onOpen={onOpenIssues} />
          <MetricRow label={t('labelUnresolvedImportantIssues')} count={issues.unresolvedImportantIssuesCount} onOpen={onOpenIssues} />
          {issues.recurringCategories.map((entry: WeeklyReviewRecurringCategory) => (
            <p key={entry.category} className="m-0 text-sm text-text-muted">
              {t('recurringCategoryLine')
                .replace('{count}', String(entry.count))
                .replace('{category}', t(CATEGORY_LABEL_KEY[entry.category] ?? 'categoryOther'))}
            </p>
          ))}
        </div>
      ) : null}
    </SectionCard>
  );
}

function PurchasingSection({
  t,
  summary,
  onOpenPurchases,
  onOpenInventoryShortage,
}: SectionProps & Pick<WeeklyReviewDrillDownHandlers, 'onOpenPurchases' | 'onOpenInventoryShortage'>) {
  const purchasing = summary.purchasing;
  return (
    <SectionCard title={t('sectionPurchasing')} notAvailable={purchasing === null} notAvailableLabel={t('notAvailableModuleOff')}>
      {purchasing ? (
        <div className="flex flex-col gap-1.5">
          <MetricRow label={t('labelShortageItems')} count={purchasing.shortageItemsCount} onOpen={onOpenInventoryShortage} />
          <MetricRow label={t('labelPendingPurchases')} count={purchasing.pendingPurchasesCount} onOpen={onOpenPurchases} />
        </div>
      ) : null}
    </SectionCard>
  );
}

/**
 * Compact rollup of currently-unresolved items across Operations exceptions
 * + unresolved Issues + pending purchases -- deliberately NOT reading from
 * `AttentionPanel` or duplicating its component/counts (mission contract);
 * this reuses the SAME already-fetched `summary` counts computed above, just
 * presented together.
 */
function StillOpenSection({
  t,
  summary,
  onOpenOperations,
  onOpenIssues,
  onOpenPurchases,
}: SectionProps & Pick<WeeklyReviewDrillDownHandlers, 'onOpenOperations' | 'onOpenIssues' | 'onOpenPurchases'>) {
  const rows: { key: string; label: string; count: number; onOpen: () => void }[] = [];
  if (summary.operations && summary.operations.openExceptionsCount > 0) {
    rows.push({ key: 'ops', label: t('labelOpenExceptions'), count: summary.operations.openExceptionsCount, onOpen: onOpenOperations });
  }
  if (summary.issues && summary.issues.unresolvedIssuesCount > 0) {
    rows.push({ key: 'issues', label: t('labelUnresolvedIssues'), count: summary.issues.unresolvedIssuesCount, onOpen: onOpenIssues });
  }
  if (summary.purchasing && summary.purchasing.pendingPurchasesCount > 0) {
    rows.push({ key: 'purchases', label: t('labelPendingPurchases'), count: summary.purchasing.pendingPurchasesCount, onOpen: onOpenPurchases });
  }

  return (
    <SectionCard title={t('sectionStillOpen')} notAvailable={false} notAvailableLabel="">
      {rows.length === 0 ? (
        <MetadataText>{t('stillOpenNone')}</MetadataText>
      ) : (
        <div className="flex flex-col gap-1.5">
          {rows.map((row) => (
            <MetricRow key={row.key} label={row.label} count={row.count} onOpen={row.onOpen} />
          ))}
        </div>
      )}
    </SectionCard>
  );
}
