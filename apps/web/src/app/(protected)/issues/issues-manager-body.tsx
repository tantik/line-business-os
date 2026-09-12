'use client';

import { useMemo, useState, useTransition } from 'react';
import type { Lang } from '@/lib/demo/cafe/i18n';
import type { Issue, IssueCategoryValue } from '@/lib/issues/issues';
import type { IssueCategory, IssueKind, IssueSeverity } from '@/lib/issues/validation';
import { acknowledgeIssueAction, reportIssueAction, resolveIssueAction } from '@/lib/issues/issues-actions';
import {
  Button,
  Dialog,
  EmptyState,
  Field,
  FormActions,
  InlineAlert,
  MetadataText,
  SegmentedControl,
  Select,
  StatusBadge,
  Textarea,
} from '@line-os/ui';
import { describeIssuesWriteError } from './error-copy';
import type { tIssues } from './issues-i18n';

type TFn = (key: Parameters<typeof tIssues>[1]) => string;

export interface IssuesManagerBodyProps {
  t: TFn;
  lang: Lang;
  locationId: string;
  /** `api.issues_open` (open + acknowledged), already filtered to this Manager's own location -- `null` when the read failed. */
  issuesOpen: Issue[] | null;
  /** `api.issues` (full history incl. resolved), already filtered to this Manager's own location -- `null` when the read failed. Only the resolved subset is rendered (Open items already come from `issuesOpen`). */
  issuesAll: Issue[] | null;
  onChange: () => void;
}

const CATEGORY_LABEL_KEY: Record<IssueCategoryValue, Parameters<typeof tIssues>[1]> = {
  equipment: 'categoryEquipment',
  inventory: 'categoryInventory',
  cleaning: 'categoryCleaning',
  facility: 'categoryFacility',
  customer: 'categoryCustomer',
  operations: 'categoryOperations',
  other: 'categoryOther',
};

const CATEGORY_OPTIONS: IssueCategory[] = ['equipment', 'inventory', 'cleaning', 'facility', 'customer', 'operations', 'other'];

/** action-required issues first, then other open issues, then handover notes -- within each bucket, most recent first. */
function sortRank(issue: Issue): number {
  if (issue.kind === 'issue' && issue.severity === 'important' && issue.status === 'open') return 0;
  if (issue.kind === 'issue') return 1;
  return 2;
}

/**
 * Issues & Handover Manager frontend body (Cafe v2.2 WP2, Slice B). Mirrors
 * `attention-section.tsx`'s ORUWA Design System v1 conventions closely:
 * `StatusBadge` for severity/status, `MetadataText` for secondary metadata,
 * a `Field`+`Textarea` render-prop resolve-note form, `Button` size="sm" row
 * actions. A `SegmentedControl` toggles Open (action feed) vs History
 * (resolved) -- deliberately just a toggle, not a separate elaborate screen
 * (mission MVP-boundary guidance).
 */
export function IssuesManagerBody({ t, lang, locationId, issuesOpen, issuesAll, onChange }: IssuesManagerBodyProps) {
  const [view, setView] = useState<'open' | 'history'>('open');
  const [reportOpen, setReportOpen] = useState(false);
  const [expandedIssueId, setExpandedIssueId] = useState<string | null>(null);

  const openIssues = useMemo(() => {
    if (!issuesOpen) return [];
    return [...issuesOpen].sort((a, b) => sortRank(a) - sortRank(b) || b.createdAt.localeCompare(a.createdAt));
  }, [issuesOpen]);

  const resolvedIssues = useMemo(() => {
    if (!issuesAll) return [];
    return issuesAll
      .filter((issue) => issue.status === 'resolved')
      .sort((a, b) => (b.resolvedAt ?? b.createdAt).localeCompare(a.resolvedAt ?? a.createdAt));
  }, [issuesAll]);

  const readFailed = view === 'open' ? issuesOpen === null : issuesAll === null;
  const list = view === 'open' ? openIssues : resolvedIssues;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SegmentedControl
          value={view}
          onValueChange={(value) => setView(value as 'open' | 'history')}
          aria-label={t('viewSwitcherLabel')}
          options={[
            { value: 'open', label: t('viewOpen') },
            { value: 'history', label: t('viewHistory') },
          ]}
        />
        <Button variant="primary" size="sm" onClick={() => setReportOpen(true)}>
          {t('reportButton')}
        </Button>
      </div>

      {readFailed ? (
        <p className="m-0 text-sm text-text-muted">{t('unavailable')}</p>
      ) : list.length === 0 ? (
        <EmptyState
          title={view === 'open' ? t('emptyOpenTitle') : t('emptyHistoryTitle')}
          description={view === 'open' ? t('emptyOpenDescription') : t('emptyHistoryDescription')}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {list.map((issue) => (
            <IssueRow
              key={issue.issueId}
              t={t}
              lang={lang}
              issue={issue}
              expanded={expandedIssueId === issue.issueId}
              onToggle={() => setExpandedIssueId((current) => (current === issue.issueId ? null : issue.issueId))}
              onChange={() => {
                setExpandedIssueId(null);
                onChange();
              }}
            />
          ))}
        </div>
      )}

      <ReportIssueDialog
        t={t}
        lang={lang}
        locationId={locationId}
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        onSuccess={() => {
          setReportOpen(false);
          onChange();
        }}
      />
    </div>
  );
}

interface IssueRowProps {
  t: TFn;
  lang: Lang;
  issue: Issue;
  expanded: boolean;
  onToggle: () => void;
  onChange: () => void;
}

function IssueRow({ t, lang, issue, expanded, onToggle, onChange }: IssueRowProps) {
  const [acknowledging, setAcknowledging] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const badge =
    issue.kind === 'handover' ? (
      <StatusBadge tone="neutral" showIcon={false}>
        {t('kindHandoverBadge')}
      </StatusBadge>
    ) : issue.severity === 'important' ? (
      <StatusBadge tone="critical">{t('severityImportant')}</StatusBadge>
    ) : (
      <StatusBadge tone="warning">{t('severityNormal')}</StatusBadge>
    );

  const statusBadge =
    issue.status === 'acknowledged' ? (
      <StatusBadge tone="neutral" showIcon={false}>
        {t('statusAcknowledged')}
      </StatusBadge>
    ) : null;

  const categoryLabel = issue.category ? t(CATEGORY_LABEL_KEY[issue.category]) : null;
  const dateFormatter = (iso: string) => new Date(iso).toLocaleString(lang === 'ja' ? 'ja-JP' : 'en-US');

  function handleAcknowledge() {
    setError(null);
    setAcknowledging(true);
    const formData = new FormData();
    formData.set('issueId', issue.issueId);
    void (async () => {
      const result = await acknowledgeIssueAction(formData);
      setAcknowledging(false);
      if (result.status === 'success') {
        onChange();
      } else {
        setError(describeIssuesWriteError(result, lang));
      }
    })();
  }

  return (
    <div className="rounded-md border border-border bg-surface p-3 shadow-card">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full min-h-11 flex-wrap items-center gap-x-3 gap-y-1 rounded-sm text-left"
      >
        <strong className="min-w-[160px] flex-1 text-base font-medium text-text-primary">{issue.note}</strong>
        {badge}
        {statusBadge}
      </button>

      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
        {categoryLabel ? <MetadataText>{categoryLabel}</MetadataText> : null}
        <MetadataText>
          {t('reportedByLabel')}: {issue.reportedByRole === 'manager' ? t('reportedByManager') : t('reportedByStaff')}
        </MetadataText>
        <MetadataText>
          {t('businessDateLabel')}: {issue.businessDate}
        </MetadataText>
      </div>

      {expanded ? (
        <div className="mt-2 flex flex-col gap-2 border-t border-border pt-2">
          <MetadataText>
            {t('reportedAtLabel')}: {dateFormatter(issue.createdAt)}
          </MetadataText>
          {issue.acknowledgedAt ? (
            <MetadataText>
              {t('acknowledgedAtLabel')}: {dateFormatter(issue.acknowledgedAt)}
            </MetadataText>
          ) : null}
          {issue.status === 'resolved' ? (
            <>
              {issue.resolvedAt ? (
                <MetadataText>
                  {t('resolvedAtLabel')}: {dateFormatter(issue.resolvedAt)}
                </MetadataText>
              ) : null}
              {issue.resolutionNote ? (
                <p className="m-0 text-sm text-text-primary">
                  {t('resolutionNoteLabel')}: {issue.resolutionNote}
                </p>
              ) : null}
            </>
          ) : null}

          {error ? <InlineAlert tone="critical">{error}</InlineAlert> : null}

          {issue.status === 'open' || issue.status === 'acknowledged' ? (
            resolving ? (
              <ResolveIssueForm
                t={t}
                lang={lang}
                issueId={issue.issueId}
                onCancel={() => setResolving(false)}
                onSuccess={onChange}
              />
            ) : (
              <div className="flex gap-2">
                {issue.status === 'open' ? (
                  <Button variant="secondary" size="sm" loading={acknowledging} onClick={handleAcknowledge}>
                    {t('acknowledgeButton')}
                  </Button>
                ) : null}
                <Button variant="secondary" size="sm" onClick={() => setResolving(true)}>
                  {t('resolveButton')}
                </Button>
              </div>
            )
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

interface ResolveIssueFormProps {
  t: TFn;
  lang: Lang;
  issueId: string;
  onCancel: () => void;
  onSuccess: () => void;
}

function ResolveIssueForm({ t, lang, issueId, onCancel, onSuccess }: ResolveIssueFormProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');

  function handleSubmit() {
    setError(null);
    const formData = new FormData();
    formData.set('issueId', issueId);
    if (note.trim().length > 0) formData.set('resolutionNote', note);
    startTransition(async () => {
      const result = await resolveIssueAction(formData);
      if (result.status === 'success') {
        onSuccess();
      } else {
        setError(describeIssuesWriteError(result, lang));
      }
    });
  }

  return (
    <div className="flex flex-col gap-2.5">
      <Field label={t('resolveNoteLabel')}>
        {(fieldProps) => (
          <Textarea {...fieldProps} rows={2} maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} />
        )}
      </Field>
      {error ? <InlineAlert tone="critical">{error}</InlineAlert> : null}
      <div className="flex gap-2">
        <Button variant="primary" size="sm" loading={isPending} onClick={handleSubmit}>
          {t('resolveSubmit')}
        </Button>
        <Button variant="secondary" size="sm" onClick={onCancel} disabled={isPending}>
          {t('formCancel')}
        </Button>
      </div>
    </div>
  );
}

interface ReportIssueDialogProps {
  t: TFn;
  lang: Lang;
  locationId: string;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * Manager report-issue form (deliberately included in this slice -- the
 * acknowledge/resolve machinery already built the Field/Textarea/FormActions/
 * loading/InlineAlert pattern this needed almost for free, and
 * `api.issues_create` already resolves `reported_by_role='manager'` from the
 * caller's own `issues.manage` permission, so no new RPC/RLS surface was
 * required). See the mission report for this decision.
 */
function ReportIssueDialog({ t, lang, locationId, open, onClose, onSuccess }: ReportIssueDialogProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<IssueKind>('issue');
  const [category, setCategory] = useState<IssueCategory | ''>('');
  const [severity, setSeverity] = useState<IssueSeverity>('normal');
  const [note, setNote] = useState('');

  function reset() {
    setError(null);
    setKind('issue');
    setCategory('');
    setSeverity('normal');
    setNote('');
  }

  function handleSubmit() {
    setError(null);
    const formData = new FormData();
    formData.set('locationId', locationId);
    formData.set('kind', kind);
    formData.set('note', note);
    if (category) formData.set('category', category);
    if (kind === 'issue') formData.set('severity', severity);
    startTransition(async () => {
      const result = await reportIssueAction(formData);
      if (result.status === 'success') {
        reset();
        onSuccess();
      } else {
        setError(describeIssuesWriteError(result, lang));
      }
    });
  }

  return (
    <Dialog
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title={t('reportHeading')}
      size="form"
      closeLabel={t('formCancel')}
      footer={
        <FormActions
          primary={
            <Button variant="primary" loading={isPending} disabled={note.trim().length === 0} onClick={handleSubmit}>
              {isPending ? t('formSubmitting') : t('formSubmit')}
            </Button>
          }
          secondary={
            <Button
              variant="secondary"
              disabled={isPending}
              onClick={() => {
                reset();
                onClose();
              }}
            >
              {t('formCancel')}
            </Button>
          }
        />
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <p className="m-0 text-sm font-medium text-text-primary">{t('formKindLabel')}</p>
          <SegmentedControl
            value={kind}
            onValueChange={(value) => setKind(value as IssueKind)}
            aria-label={t('formKindLabel')}
            options={[
              { value: 'issue', label: t('kindIssue') },
              { value: 'handover', label: t('kindHandover') },
            ]}
          />
        </div>

        <Field label={t('formCategoryLabel')}>
          {(fieldProps) => (
            <Select
              {...fieldProps}
              value={category}
              onValueChange={(value) => setCategory(value as IssueCategory)}
              placeholder={t('categoryOptionNone')}
              options={CATEGORY_OPTIONS.map((option) => ({ value: option, label: t(CATEGORY_LABEL_KEY[option]) }))}
            />
          )}
        </Field>

        {kind === 'issue' ? (
          <div className="flex flex-col gap-1.5">
            <p className="m-0 text-sm font-medium text-text-primary">{t('formSeverityLabel')}</p>
            <SegmentedControl
              value={severity}
              onValueChange={(value) => setSeverity(value as IssueSeverity)}
              aria-label={t('formSeverityLabel')}
              options={[
                { value: 'normal', label: t('severityNormal') },
                { value: 'important', label: t('severityImportant') },
              ]}
            />
          </div>
        ) : null}

        <Field label={t('formNoteLabel')} required>
          {(fieldProps) => (
            <Textarea {...fieldProps} rows={4} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} />
          )}
        </Field>

        {error ? <InlineAlert tone="critical">{error}</InlineAlert> : null}
      </div>
    </Dialog>
  );
}
