'use client';

import { useMemo, useState, useTransition } from 'react';
import type { Lang } from '@/lib/demo/cafe/i18n';
import type { OperationsOpenException } from '@/lib/operations/exceptions';
import type { OperationsExpectedTask } from '@/lib/operations/tasks';
import type { OperationsTemplateItem } from '@/lib/operations/templates';
import { resolveException } from '@/lib/operations/exceptions-actions';
import { Button, Field, InlineAlert, MetadataText, StatusBadge, Textarea } from '@line-os/ui';
import { describeOperationsWriteError } from './error-copy';
import type { tOperations } from './operations-i18n';

type TFn = (key: Parameters<typeof tOperations>[1]) => string;

export interface AttentionSectionProps {
  t: TFn;
  lang: Lang;
  exceptions: OperationsOpenException[] | null;
  /** Today's expected tasks at the Manager's own location -- used only to resolve `instanceId` -> a human-readable task name; an exception whose task is not in today's list (e.g. opened on an earlier business date) falls back to a generic label, never a raw id. */
  tasksToday: OperationsExpectedTask[];
  /** Every checklist item the caller may see -- used to resolve `itemId` -> a human-readable item label. */
  items: OperationsTemplateItem[];
  onChange: () => void;
}

interface ExceptionGroup {
  key: string;
  taskName: string;
  source: OperationsOpenException['source'];
  sourceLabel: string;
  severity: OperationsOpenException['severity'];
  exceptions: OperationsOpenException[];
}

/**
 * ORUWA Design System v1 pilot — Manager Operations Attention (mission §22).
 * This feed already only ever contains currently-*open* exceptions (the RPC
 * behind `exceptions` never returns resolved ones) — "actionable first,
 * history separate" (mission §27) is therefore already the read contract,
 * not new work. What both audits actually found broken is presentation:
 * repeated `critical_missed` events for the same task read as an
 * undifferentiated wall of generic "タスク" rows with no way to tell 14
 * events from 2 distinct problems at a glance.
 *
 * Fix, presentation-only (no query/RPC/severity-computation change): group
 * same-task-same-source-same-severity exceptions together with one
 * `StatusBadge` count instead of N repeated rows; each group expands to its
 * individual exceptions (still resolvable one at a time — resolution
 * semantics are per-exception in the schema, unchanged). Severity is the
 * real STATUS; source/opened-at are quiet `MetadataText`.
 */
export function AttentionSection({ t, lang, exceptions, tasksToday, items, onChange }: AttentionSectionProps) {
  const taskByInstanceId = new Map(tasksToday.filter((task) => task.instanceId !== null).map((task) => [task.instanceId as string, task]));
  // `critical_missed` exceptions (0116) are instance-less -- resolve their task
  // name by (scheduleId, businessDate) instead.
  const taskByScheduleAndDate = new Map(tasksToday.map((task) => [`${task.scheduleId}|${task.businessDate}`, task]));
  const itemById = new Map(items.map((item) => [item.itemId, item]));
  const [expandedGroupKey, setExpandedGroupKey] = useState<string | null>(null);

  function resolveTaskName(exception: OperationsOpenException): string {
    const task =
      (exception.instanceId ? taskByInstanceId.get(exception.instanceId) : null) ??
      (exception.scheduleId && exception.businessDate
        ? taskByScheduleAndDate.get(`${exception.scheduleId}|${exception.businessDate}`)
        : null) ??
      null;
    return task ? task.templateName : t('attentionUnknownTask');
  }

  function sourceLabelFor(source: OperationsOpenException['source']): string {
    return source === 'threshold'
      ? t('attentionSourceThreshold')
      : source === 'critical_missed'
        ? t('attentionSourceCriticalMissed')
        : t('attentionSourceReported');
  }

  const groups = useMemo<ExceptionGroup[]>(() => {
    const sorted = [...(exceptions ?? [])].sort(
      (a, b) => b.createdAt.localeCompare(a.createdAt) || a.exceptionId.localeCompare(b.exceptionId),
    );
    const byKey = new Map<string, ExceptionGroup>();
    for (const exception of sorted) {
      const taskName = resolveTaskName(exception);
      const key = `${taskName}|${exception.source}|${exception.severity}`;
      const existing = byKey.get(key);
      if (existing) {
        existing.exceptions.push(exception);
      } else {
        byKey.set(key, {
          key,
          taskName,
          source: exception.source,
          sourceLabel: sourceLabelFor(exception.source),
          severity: exception.severity,
          exceptions: [exception],
        });
      }
    }
    // action_required groups first (most actionable), then by most-recent exception in the group.
    return [...byKey.values()].sort(
      (a, b) =>
        (a.severity === 'action_required' ? 0 : 1) - (b.severity === 'action_required' ? 0 : 1) ||
        (b.exceptions[0]?.createdAt ?? '').localeCompare(a.exceptions[0]?.createdAt ?? ''),
    );
  }, [exceptions, tasksToday]);

  if (exceptions === null) {
    return (
      <section className="mt-4 rounded-md border border-border bg-surface p-4 shadow-card">
        <p className="m-0 text-sm text-text-muted">{t('unavailable')}</p>
      </section>
    );
  }

  if (groups.length === 0) {
    return (
      <section className="mt-4 rounded-md border border-border bg-surface p-4 shadow-card">
        <p className="m-0 text-sm text-text-muted">{t('attentionNoOpenExceptions')}</p>
      </section>
    );
  }

  return (
    <section className="mt-4 flex flex-col gap-2">
      {groups.map((group) => (
        <AttentionGroupCard
          key={group.key}
          t={t}
          lang={lang}
          group={group}
          itemById={itemById}
          expanded={expandedGroupKey === group.key}
          onToggle={() => setExpandedGroupKey((current) => (current === group.key ? null : group.key))}
          onChange={onChange}
        />
      ))}
    </section>
  );
}

interface AttentionGroupCardProps {
  t: TFn;
  lang: Lang;
  group: ExceptionGroup;
  itemById: Map<string, OperationsTemplateItem>;
  expanded: boolean;
  onToggle: () => void;
  onChange: () => void;
}

function AttentionGroupCard({ t, lang, group, itemById, expanded, onToggle, onChange }: AttentionGroupCardProps) {
  const count = group.exceptions.length;
  return (
    <div className="rounded-md border border-border bg-surface p-3 shadow-card">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full min-h-11 flex-wrap items-center gap-x-3 gap-y-1 rounded-sm text-left"
      >
        <strong className="min-w-[160px] flex-1 text-base font-medium text-text-primary">{group.taskName}</strong>
        <StatusBadge tone={group.severity === 'action_required' ? 'critical' : 'warning'}>
          {group.severity === 'action_required' ? t('severityActionRequired') : t('severityWarning')}
        </StatusBadge>
        <MetadataText>{group.sourceLabel}</MetadataText>
        {count > 1 ? (
          <StatusBadge tone="neutral" showIcon={false}>
            {count}
          </StatusBadge>
        ) : null}
      </button>

      {expanded ? (
        <div className="mt-2 flex flex-col gap-2 border-t border-border pt-2">
          {group.exceptions.map((exception) => (
            <ExceptionRow key={exception.exceptionId} t={t} lang={lang} exception={exception} itemById={itemById} onChange={onChange} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

interface ExceptionRowProps {
  t: TFn;
  lang: Lang;
  exception: OperationsOpenException;
  itemById: Map<string, OperationsTemplateItem>;
  onChange: () => void;
}

function ExceptionRow({ t, lang, exception, itemById, onChange }: ExceptionRowProps) {
  const [resolving, setResolving] = useState(false);
  const item = exception.itemId ? (itemById.get(exception.itemId) ?? null) : null;

  return (
    <div className="flex flex-col gap-1.5 rounded-sm bg-surface-elevated p-2.5">
      {item ? (
        <MetadataText>
          {t('attentionItemLabel')}: {item.label}
        </MetadataText>
      ) : null}
      {exception.note ? <p className="m-0 text-sm text-text-primary">{exception.note}</p> : null}
      {exception.source === 'critical_missed' ? (
        <p className="m-0 text-sm text-text-primary">
          {t('attentionCriticalMissedHint')}
          {exception.businessDate ? ` (${exception.businessDate})` : ''}
        </p>
      ) : null}
      <MetadataText>
        {t('attentionOpenedAtLabel')}: {new Date(exception.createdAt).toLocaleString(lang === 'ja' ? 'ja-JP' : 'en-US')}
      </MetadataText>

      {resolving ? (
        <ResolveExceptionForm
          t={t}
          lang={lang}
          exceptionId={exception.exceptionId}
          onCancel={() => setResolving(false)}
          onSuccess={() => {
            setResolving(false);
            onChange();
          }}
        />
      ) : (
        <Button variant="secondary" size="sm" className="self-start" onClick={() => setResolving(true)}>
          {t('resolveButton')}
        </Button>
      )}
    </div>
  );
}

interface ResolveExceptionFormProps {
  t: TFn;
  lang: Lang;
  exceptionId: string;
  onCancel: () => void;
  onSuccess: () => void;
}

function ResolveExceptionForm({ t, lang, exceptionId, onCancel, onSuccess }: ResolveExceptionFormProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');

  function handleSubmit() {
    setError(null);
    const formData = new FormData();
    formData.set('exceptionId', exceptionId);
    if (note.trim().length > 0) formData.set('resolutionNote', note);
    startTransition(async () => {
      const result = await resolveException(formData);
      if (result.status === 'success') {
        onSuccess();
      } else {
        setError(describeOperationsWriteError(result, lang));
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
