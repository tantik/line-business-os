'use client';

import { useEffect, useState, useTransition } from 'react';
import type { Lang } from '@/lib/demo/cafe/i18n';
import type { OperationsExpectedTask, OperationsExceptionSeverity, OperationsItemResponse } from '@/lib/operations/tasks';
import type { OperationsTemplateItem } from '@/lib/operations/templates';
import { completeTask, recordResponse, reportProblem } from '@/lib/operations/tasks-actions';
import {
  Button,
  Checkbox,
  Dialog,
  Field,
  InlineAlert,
  MetadataText,
  NumberInput,
  Select,
  StatusBadge,
  Textarea,
} from '@line-os/ui';
import { describeOperationsWriteError } from './error-copy';
import { formatTaskDueWindow, tOperations } from './operations-i18n';

type TFn = (key: Parameters<typeof tOperations>[1]) => string;

export interface TaskDetailModalProps {
  open: boolean;
  onClose: () => void;
  task: OperationsExpectedTask;
  /** Every active checklist item of `task.templateId`, already filtered by the caller. */
  items: OperationsTemplateItem[];
  /** Every already-recorded response for `task.instanceId` (empty if not yet materialised). */
  responses: OperationsItemResponse[];
  lang: Lang;
  onChange: () => void;
}

type View = { kind: 'checklist' } | { kind: 'report-problem'; itemId: string | null };

/**
 * ORUWA Design System v1 pilot — Staff Operations task detail (mission §20).
 * Redesign priority, top to bottom: WHAT task is this? WHEN is it due? IS
 * there a problem? HOW MUCH is complete? WHAT do I do next?
 *
 * Business logic/RPC wiring is byte-identical to the previous implementation
 * (`completeTask`/`recordResponse`/`reportProblem`, same FormData shape,
 * same read-only-once-completed rule) — only presentation changed:
 * - One compact status row: `StatusBadge` for the real state, `MetadataText`
 *   (plain, not a pill) for due time/category — Status/Metadata/Action
 *   model, mission §12 — instead of 3 equally-weighted neutral badges.
 * - A progress count ("2/4") next to the checklist heading.
 * - Migrated off the design-kit `Modal` onto `Dialog` (Radix): this exact
 *   component, opened from inside the Operations popup's own `Modal`, was
 *   the audit's primary nested-modal/double-scroll/focus-escape example
 *   (mission §16) — Report-problem used to be a second internal view inside
 *   the same shell, which stays true here, but the shell itself now has a
 *   real focus trap + scroll lock + stack-aware Escape.
 * - Report-problem's Submit/Cancel and the checklist's Report/Complete now
 *   render in `Dialog`'s `footer` slot — outside the scrolling body, always
 *   reachable without scrolling the whole checklist first (audit: "main
 *   actions found only after a long checklist, not sticky").
 */
export function TaskDetailModal({ open, onClose, task, items, responses, lang, onChange }: TaskDetailModalProps) {
  const t: TFn = (key) => tOperations(lang, key);
  const [view, setView] = useState<View>({ kind: 'checklist' });
  const [completeError, setCompleteError] = useState<string | null>(null);
  const [isCompletePending, startCompleteTransition] = useTransition();

  const [reportNote, setReportNote] = useState('');
  const [reportSeverity, setReportSeverity] = useState<OperationsExceptionSeverity>('action_required');
  const [reportError, setReportError] = useState<string | null>(null);
  const [isReportPending, startReportTransition] = useTransition();

  const readOnly = task.status === 'completed';
  const sortedItems = [...items].sort((a, b) => a.sortOrder - b.sortOrder || a.itemId.localeCompare(b.itemId));
  const responseByItemId = new Map(responses.map((r) => [r.itemId, r]));
  const missingRequiredItemIds = new Set(
    sortedItems.filter((item) => item.isRequired && !responseByItemId.has(item.itemId)).map((item) => item.itemId),
  );
  const answeredCount = sortedItems.filter((item) => responseByItemId.has(item.itemId)).length;

  function openReportProblem(itemId: string | null) {
    setReportNote('');
    setReportSeverity('action_required');
    setReportError(null);
    setView({ kind: 'report-problem', itemId });
  }

  function backToChecklist() {
    setView({ kind: 'checklist' });
  }

  function handleModalClose() {
    if (view.kind !== 'checklist') {
      backToChecklist();
      return;
    }
    onClose();
  }

  function handleComplete() {
    setCompleteError(null);
    const formData = new FormData();
    formData.set('scheduleId', task.scheduleId);
    startCompleteTransition(async () => {
      const result = await completeTask(formData);
      if (result.status === 'success') {
        onChange();
      } else {
        setCompleteError(describeOperationsWriteError(result, lang, 'staff'));
      }
    });
  }

  function handleReportSubmit() {
    setReportError(null);
    const formData = new FormData();
    formData.set('scheduleId', task.scheduleId);
    if (view.kind === 'report-problem' && view.itemId) formData.set('itemId', view.itemId);
    formData.set('note', reportNote);
    formData.set('severity', reportSeverity);
    startReportTransition(async () => {
      const result = await reportProblem(formData);
      if (result.status === 'success') {
        backToChecklist();
        onChange();
      } else {
        setReportError(describeOperationsWriteError(result, lang, 'staff'));
      }
    });
  }

  const title = view.kind === 'checklist' ? task.templateName : t('reportProblemHeading');

  const footer =
    view.kind === 'report-problem' ? (
      <>
        <Button variant="secondary" size="md" onClick={backToChecklist} disabled={isReportPending}>
          {t('formCancel')}
        </Button>
        <Button variant="destructive" size="md" loading={isReportPending} onClick={handleReportSubmit}>
          {t('reportProblemSubmit')}
        </Button>
      </>
    ) : !readOnly ? (
      <>
        <Button variant="secondary" size="md" onClick={() => openReportProblem(null)}>
          {t('reportProblemButton')}
        </Button>
        <Button variant="primary" size="md" loading={isCompletePending} onClick={handleComplete}>
          {t('completeTaskButton')}
        </Button>
      </>
    ) : null;

  return (
    <Dialog open={open} onClose={handleModalClose} title={title} size="form" closeLabel={t('formCancel')} footer={footer}>
      {view.kind === 'report-problem' ? (
        <div className="flex flex-col gap-4">
          <Field label={t('reportProblemSeverityLabel')}>
            {(fieldProps) => (
              <Select
                {...fieldProps}
                value={reportSeverity}
                onValueChange={(value) => setReportSeverity(value as OperationsExceptionSeverity)}
                options={[
                  { value: 'action_required', label: t('severityActionRequired') },
                  { value: 'warning', label: t('severityWarning') },
                ]}
              />
            )}
          </Field>
          <Field label={t('reportProblemNoteLabel')}>
            {(fieldProps) => (
              <Textarea {...fieldProps} maxLength={2000} value={reportNote} onChange={(event) => setReportNote(event.target.value)} />
            )}
          </Field>
          {reportError ? <InlineAlert tone="critical">{reportError}</InlineAlert> : null}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            {readOnly ? (
              <StatusBadge tone="success">{t('taskStateCompleted')}</StatusBadge>
            ) : task.state === 'overdue' ? (
              <StatusBadge tone="critical">{t('taskStateOverdue')}</StatusBadge>
            ) : (
              <StatusBadge tone="neutral" showIcon={false}>
                {task.state === 'in_progress' ? t('taskStateInProgress') : t('taskStateNotStarted')}
              </StatusBadge>
            )}
            <MetadataText>
              {t('taskDueAt')} {formatTaskDueWindow(lang, task.dueTime, task.windowEndTime)}
            </MetadataText>
            {task.category ? <MetadataText>{task.category}</MetadataText> : null}
            {!readOnly && sortedItems.length > 0 ? (
              <MetadataText className="ml-auto tabular-nums">
                {answeredCount}/{sortedItems.length}
              </MetadataText>
            ) : null}
          </div>

          {readOnly ? <p className="m-0 text-sm text-text-muted">{t('taskCompletedNote')}</p> : null}

          <section>
            <h3 className="m-0 text-base font-semibold text-text-primary">{t('checklistHeading')}</h3>
            {sortedItems.length === 0 ? (
              <p className="mt-3 text-sm text-text-muted">{t('noChecklistItems')}</p>
            ) : (
              <ul className="mt-3 grid list-none gap-2.5 p-0">
                {sortedItems.map((item) => (
                  <ItemResponseRow
                    key={item.itemId}
                    t={t}
                    lang={lang}
                    scheduleId={task.scheduleId}
                    item={item}
                    response={responseByItemId.get(item.itemId) ?? null}
                    missing={missingRequiredItemIds.has(item.itemId)}
                    readOnly={readOnly}
                    onSaved={onChange}
                    onReportProblem={() => openReportProblem(item.itemId)}
                  />
                ))}
              </ul>
            )}
          </section>

          {completeError ? <InlineAlert tone="critical">{completeError}</InlineAlert> : null}
        </div>
      )}
    </Dialog>
  );
}

interface ItemResponseRowProps {
  t: TFn;
  lang: Lang;
  scheduleId: string;
  item: OperationsTemplateItem;
  response: OperationsItemResponse | null;
  missing: boolean;
  readOnly: boolean;
  onSaved: () => void;
  onReportProblem: () => void;
}

function ItemResponseRow({ t, lang, scheduleId, item, response, missing, readOnly, onSaved, onReportProblem }: ItemResponseRowProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [boolValue, setBoolValue] = useState<boolean>(response?.responseBool ?? false);
  const [numericValue, setNumericValue] = useState<number | ''>(
    response?.responseNumeric !== null && response?.responseNumeric !== undefined ? response.responseNumeric : '',
  );
  const [textValue, setTextValue] = useState<string>(response?.responseText ?? '');

  useEffect(() => {
    setBoolValue(response?.responseBool ?? false);
    setNumericValue(response?.responseNumeric !== null && response?.responseNumeric !== undefined ? response.responseNumeric : '');
    setTextValue(response?.responseText ?? '');
  }, [response]);

  function save(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await recordResponse(formData);
      if (result.status === 'success') {
        onSaved();
      } else {
        setError(describeOperationsWriteError(result, lang, 'staff'));
      }
    });
  }

  function handleBoolChange(checked: boolean) {
    setBoolValue(checked);
    const formData = new FormData();
    formData.set('scheduleId', scheduleId);
    formData.set('itemId', item.itemId);
    formData.set('responseType', 'boolean');
    formData.set('responseBool', checked ? 'true' : 'false');
    save(formData);
  }

  function handleNumericSave() {
    if (numericValue === '') {
      setError(t('errResponseRequiresExactlyOneValue'));
      return;
    }
    const formData = new FormData();
    formData.set('scheduleId', scheduleId);
    formData.set('itemId', item.itemId);
    formData.set('responseType', 'numeric');
    formData.set('responseNumeric', String(numericValue));
    save(formData);
  }

  function handleTextSave() {
    if (textValue.trim().length === 0) {
      setError(t('errResponseRequiresExactlyOneValue'));
      return;
    }
    const formData = new FormData();
    formData.set('scheduleId', scheduleId);
    formData.set('itemId', item.itemId);
    formData.set('responseType', 'text');
    formData.set('responseText', textValue);
    save(formData);
  }

  const rangeHint =
    item.numericMin !== null || item.numericMax !== null
      ? `${t('numericRangeHint')}: ${item.numericMin ?? '—'}–${item.numericMax ?? '—'}${item.numericUnit ? ` ${item.numericUnit}` : ''}`
      : t('thresholdNotConfiguredStaff');

  return (
    <li className="flex flex-col gap-2 rounded-md bg-surface-elevated p-3">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <strong className="min-w-[160px] flex-1 text-base font-medium text-text-primary">{item.label}</strong>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {item.isCritical ? (
            <StatusBadge tone="warning" size="sm">
              {t('criticalBadge')}
            </StatusBadge>
          ) : null}
          {!item.isRequired ? (
            <StatusBadge tone="muted" size="sm" showIcon={false}>
              {t('optionalBadge')}
            </StatusBadge>
          ) : null}
          {missing ? (
            <StatusBadge tone="warning" size="sm">
              {t('itemMissingHint')}
            </StatusBadge>
          ) : null}
        </div>
      </div>

      {item.responseType === 'boolean' ? (
        <Checkbox
          checked={boolValue}
          disabled={readOnly || isPending}
          onCheckedChange={handleBoolChange}
          label={isPending ? t('responseSaving') : response ? t('responseSaved') : t('itemMissingHint')}
        />
      ) : item.responseType === 'numeric' ? (
        <div className="flex flex-col gap-1">
          <div className="flex items-end gap-2">
            <NumberInput
              value={numericValue}
              onValueChange={setNumericValue}
              unit={item.numericUnit ?? undefined}
              disabled={readOnly}
              className="flex-1"
            />
            {!readOnly ? (
              <Button variant="secondary" size="md" loading={isPending} onClick={handleNumericSave}>
                {t('formSaveItem')}
              </Button>
            ) : null}
          </div>
          <MetadataText>{rangeHint}</MetadataText>
        </div>
      ) : (
        <div className="flex items-end gap-2">
          <input
            className="h-11 flex-1 rounded-md border border-border bg-surface px-3 text-base text-text-primary hover:border-border-strong disabled:cursor-not-allowed disabled:opacity-50"
            type="text"
            maxLength={2000}
            value={textValue}
            disabled={readOnly}
            onChange={(event) => setTextValue(event.target.value)}
          />
          {!readOnly ? (
            <Button variant="secondary" size="md" loading={isPending} onClick={handleTextSave}>
              {t('formSaveItem')}
            </Button>
          ) : null}
        </div>
      )}

      {error ? <InlineAlert tone="critical">{error}</InlineAlert> : null}

      {!readOnly ? (
        <button
          type="button"
          className="self-start text-sm text-text-muted underline decoration-dotted underline-offset-2 hover:text-text-primary"
          onClick={onReportProblem}
        >
          {t('reportProblemForItemButton')}
        </button>
      ) : null}
    </li>
  );
}
