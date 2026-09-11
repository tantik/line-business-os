'use client';

import { useMemo, useState, useTransition } from 'react';
import type { Lang } from '@/lib/demo/cafe/i18n';
import type { Issue, IssueCategoryValue } from '@/lib/issues/issues';
import type { IssueCategory, IssueKind } from '@/lib/issues/validation';
import { reportIssueAction } from '@/lib/issues/issues-actions';
import { Button, Checkbox, Dialog, EmptyState, Field, FormActions, InlineAlert, MetadataText, SegmentedControl, Select, StatusBadge, Textarea } from '@line-os/ui';
import { describeIssuesWriteError } from './error-copy';
import type { tIssues } from './issues-i18n';

type TFn = (key: Parameters<typeof tIssues>[1]) => string;

export interface IssuesStaffBodyProps {
  t: TFn;
  lang: Lang;
  locationId: string;
  /** `api.issues_open` (open + acknowledged), already filtered to this Staff member's own location -- `null` when the read failed. Staff has no manage rights in this MVP, so there is no separate History view here (see `issues-manager-body.tsx`). */
  issuesOpen: Issue[] | null;
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

/** Same priority order as the Manager Open feed (`issues-manager-body.tsx`'s `sortRank`) -- important open issues first, then other open issues, then handover notes, most-recent first within each bucket. Kept identical so the two surfaces never disagree on "what matters most" for the same data. */
function sortRank(issue: Issue): number {
  if (issue.kind === 'issue' && issue.severity === 'important' && issue.status === 'open') return 0;
  if (issue.kind === 'issue') return 1;
  return 2;
}

/**
 * Issues & Handover Staff frontend body (Cafe v2.2 WP2, Slice C). Mobile-
 * first, one-handed: a single prominent "Report something" action up top
 * (the primary interaction -- "something happened -> recorded in seconds"),
 * then a flat scan-friendly read-only list of what is currently open at the
 * caller's own location. No view switcher, no History, no Acknowledge/
 * Resolve controls -- Staff cannot manage issues in this MVP (RLS-enforced,
 * `issues.manage` is Manager-only), so none of that UI exists here at all
 * (not just hidden). Built entirely on `@line-os/ui`, mirrors
 * `issues-manager-body.tsx`'s data/sort conventions so the two surfaces stay
 * comparable.
 */
export function IssuesStaffBody({ t, lang, locationId, issuesOpen, onChange }: IssuesStaffBodyProps) {
  const [reportOpen, setReportOpen] = useState(false);

  const openIssues = useMemo(() => {
    if (!issuesOpen) return [];
    return [...issuesOpen].sort((a, b) => sortRank(a) - sortRank(b) || b.createdAt.localeCompare(a.createdAt));
  }, [issuesOpen]);

  return (
    <div className="flex flex-col gap-3">
      <Button variant="primary" size="lg" className="min-h-11 w-full" onClick={() => setReportOpen(true)}>
        {t('staffReportButton')}
      </Button>

      {issuesOpen === null ? (
        <p className="m-0 text-sm text-text-muted">{t('unavailable')}</p>
      ) : openIssues.length === 0 ? (
        <EmptyState title={t('staffEmptyTitle')} description={t('staffEmptyDescription')} />
      ) : (
        <div className="flex flex-col gap-2">
          {openIssues.map((issue) => (
            <StaffIssueRow key={issue.issueId} t={t} issue={issue} />
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

interface StaffIssueRowProps {
  t: TFn;
  issue: Issue;
}

/** Read-only row: no toggle, no expand, no action buttons -- everything a Staff reader needs (what/how urgent/category/when) is visible at a glance, matching the mission's "don't overwhelm with a management dashboard feel" guidance. */
function StaffIssueRow({ t, issue }: StaffIssueRowProps) {
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

  return (
    <div className="rounded-md border border-border bg-surface p-3 shadow-card">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <strong className="min-w-[160px] flex-1 text-base font-medium text-text-primary">{issue.note}</strong>
        {badge}
        {statusBadge}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
        {categoryLabel ? <MetadataText>{categoryLabel}</MetadataText> : null}
        <MetadataText>
          {t('reportedByLabel')}: {issue.reportedByRole === 'manager' ? t('reportedByManager') : t('reportedByStaff')}
        </MetadataText>
        <MetadataText>
          {t('businessDateLabel')}: {issue.businessDate}
        </MetadataText>
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
 * Staff quick-report form -- deliberately shorter than the Manager form's
 * decision surface: severity is NOT asked up front via a segmented control.
 * It defaults to 'normal' and a single `Checkbox` toggle marks it 'important'
 * only when the reporter actually needs to flag urgency, per the mission's
 * §23 Staff-UX guidance ("something happened -> recorded in seconds", not a
 * ticket form). Kind/category/note stay the SAME fields/vocabulary as the
 * Manager form (`issues-manager-body.tsx`) so the underlying data stays
 * comparable across both surfaces -- only the severity *interaction* differs.
 */
function ReportIssueDialog({ t, lang, locationId, open, onClose, onSuccess }: ReportIssueDialogProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<IssueKind>('issue');
  const [category, setCategory] = useState<IssueCategory | ''>('');
  const [important, setImportant] = useState(false);
  const [note, setNote] = useState('');

  function reset() {
    setError(null);
    setKind('issue');
    setCategory('');
    setImportant(false);
    setNote('');
  }

  function handleSubmit() {
    setError(null);
    const formData = new FormData();
    formData.set('locationId', locationId);
    formData.set('kind', kind);
    formData.set('note', note);
    if (category) formData.set('category', category);
    if (kind === 'issue') formData.set('severity', important ? 'important' : 'normal');
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
      title={t('staffReportHeading')}
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
          <Checkbox checked={important} onCheckedChange={setImportant} label={t('staffSeverityToggleLabel')} />
        ) : null}

        <Field label={t('formNoteLabel')} required>
          {(fieldProps) => (
            <Textarea {...fieldProps} rows={3} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} />
          )}
        </Field>

        {error ? <InlineAlert tone="critical">{error}</InlineAlert> : null}
      </div>
    </Dialog>
  );
}
