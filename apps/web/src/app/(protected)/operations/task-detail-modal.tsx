'use client';

import { useEffect, useState, useTransition } from 'react';
import type { Lang } from '@/lib/demo/cafe/i18n';
import type { OperationsExpectedTask, OperationsExceptionSeverity, OperationsItemResponse } from '@/lib/operations/tasks';
import type { OperationsTemplateItem } from '@/lib/operations/templates';
import { completeTask, recordResponse, reportProblem } from '@/lib/operations/tasks-actions';
import { Modal } from '@/components/shared/design-kit';
import { LoadingButton } from '@/components/ui/loading';
import {
  alertDanger,
  badgeStyle,
  buttonDisabled,
  buttonPrimary,
  buttonSecondary,
  checkboxInput,
  checkboxLabel,
  colors,
  input,
  mutedText,
} from '@/lib/ui/theme';
import hoverStyles from '@/lib/ui/theme.module.css';
import { buttonDanger } from '../_ui/workforce-theme';
import { describeOperationsWriteError } from './error-copy';
import { tOperations } from './operations-i18n';

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
 * One task's checklist: record a response per active item, report a problem
 * (whole task or one item), and complete the task. Mirrors
 * `TemplateDetailModal`'s exact shell shape (one `Modal`, internal view-swap
 * for the report-problem form rather than a nested `Modal`). Read-only once
 * `task.status === 'completed'` -- no more responses/report-problem/complete
 * from this UI, mirroring what the RPCs themselves would reject.
 */
export function TaskDetailModal({ open, onClose, task, items, responses, lang, onChange }: TaskDetailModalProps) {
  const t: TFn = (key) => tOperations(lang, key);
  const [view, setView] = useState<View>({ kind: 'checklist' });
  const [completeError, setCompleteError] = useState<string | null>(null);
  const [isCompletePending, startCompleteTransition] = useTransition();

  const readOnly = task.status === 'completed';
  const sortedItems = [...items].sort((a, b) => a.sortOrder - b.sortOrder || a.itemId.localeCompare(b.itemId));
  const responseByItemId = new Map(responses.map((r) => [r.itemId, r]));
  const missingRequiredItemIds = new Set(
    sortedItems.filter((item) => item.isRequired && !responseByItemId.has(item.itemId)).map((item) => item.itemId),
  );

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

  const title = view.kind === 'checklist' ? task.templateName : t('reportProblemHeading');

  return (
    <Modal open={open} onClose={handleModalClose} title={title} width="min(640px, 96vw)" closeLabel={t('formCancel')}>
      {view.kind === 'report-problem' ? (
        <ReportProblemForm
          t={t}
          lang={lang}
          scheduleId={task.scheduleId}
          itemId={view.itemId}
          onCancel={backToChecklist}
          onSuccess={() => {
            backToChecklist();
            onChange();
          }}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={badgeStyle(readOnly ? 'active' : task.state === 'overdue' ? 'warning' : 'neutral')}>
              {readOnly
                ? t('taskStateCompleted')
                : task.state === 'overdue'
                  ? t('taskStateOverdue')
                  : task.state === 'in_progress'
                    ? t('taskStateInProgress')
                    : t('taskStateNotStarted')}
            </span>
            <span style={badgeStyle('neutral')}>
              {t('taskDueAt')} {task.dueTime.slice(0, 5)}
              {task.windowEndTime ? ` ${t('taskWindowUntil')} ${task.windowEndTime.slice(0, 5)}` : ''}
            </span>
            {task.category ? <span style={badgeStyle('neutral')}>{task.category}</span> : null}
          </div>

          {readOnly ? <p style={{ margin: 0, ...mutedText }}>{t('taskCompletedNote')}</p> : null}

          <section style={{ paddingTop: 4 }}>
            <h3 style={{ margin: 0, fontSize: 15 }}>{t('checklistHeading')}</h3>
            {sortedItems.length === 0 ? (
              <p style={{ margin: '12px 0 0', ...mutedText }}>{t('noChecklistItems')}</p>
            ) : (
              <ul style={{ margin: '12px 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: 10 }}>
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
                    onReportProblem={() => setView({ kind: 'report-problem', itemId: item.itemId })}
                  />
                ))}
              </ul>
            )}
          </section>

          {completeError ? <div style={alertDanger}>{completeError}</div> : null}

          {!readOnly ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 8, borderTop: `1px solid ${colors.border}` }}>
              <LoadingButton
                type="button"
                pending={isCompletePending}
                pendingLabel={t('formSaving')}
                style={buttonPrimary}
                pendingStyle={buttonDisabled}
                className={hoverStyles.buttonPrimary}
                onClick={handleComplete}
              >
                {t('completeTaskButton')}
              </LoadingButton>
              <button
                type="button"
                className={hoverStyles.buttonSecondary}
                style={buttonSecondary}
                onClick={() => setView({ kind: 'report-problem', itemId: null })}
              >
                {t('reportProblemButton')}
              </button>
            </div>
          ) : null}
        </div>
      )}
    </Modal>
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
  const [numericValue, setNumericValue] = useState<string>(response?.responseNumeric !== null && response?.responseNumeric !== undefined ? String(response.responseNumeric) : '');
  const [textValue, setTextValue] = useState<string>(response?.responseText ?? '');

  useEffect(() => {
    setBoolValue(response?.responseBool ?? false);
    setNumericValue(response?.responseNumeric !== null && response?.responseNumeric !== undefined ? String(response.responseNumeric) : '');
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
    if (numericValue.trim().length === 0) {
      setError(t('errResponseRequiresExactlyOneValue'));
      return;
    }
    const formData = new FormData();
    formData.set('scheduleId', scheduleId);
    formData.set('itemId', item.itemId);
    formData.set('responseType', 'numeric');
    formData.set('responseNumeric', numericValue);
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

  return (
    <li
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: '10px 12px',
        borderRadius: 8,
        background: colors.surfaceElevated,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <strong style={{ flex: '1 1 200px' }}>{item.label}</strong>
        {item.isCritical ? <span style={badgeStyle('warning')}>{t('criticalBadge')}</span> : null}
        <span style={badgeStyle(item.isRequired ? 'neutral' : 'inactive')}>{item.isRequired ? t('requiredBadge') : t('optionalBadge')}</span>
        {missing ? <span style={badgeStyle('warning')}>{t('itemMissingHint')}</span> : null}
      </div>

      {item.responseType === 'boolean' ? (
        <label style={checkboxLabel}>
          <input
            style={checkboxInput}
            type="checkbox"
            checked={boolValue}
            disabled={readOnly || isPending}
            onChange={(event) => handleBoolChange(event.target.checked)}
          />
          {isPending ? t('responseSaving') : response ? t('responseSaved') : null}
        </label>
      ) : item.responseType === 'numeric' ? (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
          <label style={{ flex: '1 1 160px' }}>
            <input
              style={input}
              type="number"
              step="any"
              value={numericValue}
              disabled={readOnly}
              onChange={(event) => setNumericValue(event.target.value)}
            />
            {item.numericMin !== null || item.numericMax !== null ? (
              <span style={{ ...mutedText, fontSize: 12, display: 'block', marginTop: 4 }}>
                {t('numericRangeHint')}: {item.numericMin ?? '—'}–{item.numericMax ?? '—'} {item.numericUnit ?? ''}
              </span>
            ) : (
              <span style={{ ...mutedText, fontSize: 12, display: 'block', marginTop: 4 }}>{t('thresholdNotConfiguredStaff')}</span>
            )}
          </label>
          {!readOnly ? (
            <LoadingButton
              type="button"
              pending={isPending}
              pendingLabel={t('responseSaving')}
              style={buttonSecondary}
              pendingStyle={buttonDisabled}
              className={hoverStyles.buttonSecondary}
              onClick={handleNumericSave}
            >
              {t('formSaveItem')}
            </LoadingButton>
          ) : null}
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
          <input
            style={{ ...input, flex: '1 1 220px' }}
            type="text"
            maxLength={2000}
            value={textValue}
            disabled={readOnly}
            onChange={(event) => setTextValue(event.target.value)}
          />
          {!readOnly ? (
            <LoadingButton
              type="button"
              pending={isPending}
              pendingLabel={t('responseSaving')}
              style={buttonSecondary}
              pendingStyle={buttonDisabled}
              className={hoverStyles.buttonSecondary}
              onClick={handleTextSave}
            >
              {t('formSaveItem')}
            </LoadingButton>
          ) : null}
        </div>
      )}

      {error ? <div style={{ ...alertDanger, fontSize: 12.5, padding: '6px 10px' }}>{error}</div> : null}

      {!readOnly ? (
        <button
          type="button"
          className={hoverStyles.buttonSecondary}
          style={{ ...buttonSecondary, alignSelf: 'flex-start', fontSize: 12.5, padding: '6px 10px' }}
          onClick={onReportProblem}
        >
          {t('reportProblemForItemButton')}
        </button>
      ) : null}
    </li>
  );
}

interface ReportProblemFormProps {
  t: TFn;
  lang: Lang;
  scheduleId: string;
  itemId: string | null;
  onCancel: () => void;
  onSuccess: () => void;
}

function ReportProblemForm({ t, lang, scheduleId, itemId, onCancel, onSuccess }: ReportProblemFormProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [severity, setSeverity] = useState<OperationsExceptionSeverity>('action_required');

  function handleSubmit() {
    setError(null);
    const formData = new FormData();
    formData.set('scheduleId', scheduleId);
    if (itemId) formData.set('itemId', itemId);
    formData.set('note', note);
    formData.set('severity', severity);
    startTransition(async () => {
      const result = await reportProblem(formData);
      if (result.status === 'success') {
        onSuccess();
      } else {
        setError(describeOperationsWriteError(result, lang, 'staff'));
      }
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <label>
        <span style={{ ...mutedText, fontSize: 13 }}>{t('reportProblemSeverityLabel')}</span>
        <select
          style={input}
          value={severity}
          onChange={(event) => setSeverity(event.target.value as OperationsExceptionSeverity)}
        >
          <option value="action_required">{t('severityActionRequired')}</option>
          <option value="warning">{t('severityWarning')}</option>
        </select>
      </label>

      <label>
        <span style={{ ...mutedText, fontSize: 13 }}>{t('reportProblemNoteLabel')}</span>
        <textarea
          style={{ ...input, minHeight: 90, resize: 'vertical' }}
          maxLength={2000}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>

      {error ? <div style={alertDanger}>{error}</div> : null}

      <div style={{ display: 'flex', gap: 8 }}>
        <LoadingButton
          type="button"
          pending={isPending}
          pendingLabel={t('formSaving')}
          style={buttonDanger}
          pendingStyle={buttonDisabled}
          className={hoverStyles.buttonDanger}
          onClick={handleSubmit}
        >
          {t('reportProblemSubmit')}
        </LoadingButton>
        <button type="button" className={hoverStyles.buttonSecondary} style={buttonSecondary} onClick={onCancel} disabled={isPending}>
          {t('formCancel')}
        </button>
      </div>
    </div>
  );
}
