'use client';

import { useState, useTransition } from 'react';
import type { Lang } from '@/lib/demo/cafe/i18n';
import type { OperationsOpenException } from '@/lib/operations/exceptions';
import type { OperationsExpectedTask } from '@/lib/operations/tasks';
import type { OperationsTemplateItem } from '@/lib/operations/templates';
import { resolveException } from '@/lib/operations/exceptions-actions';
import { LoadingButton } from '@/components/ui/loading';
import { alertDanger, badgeStyle, buttonDisabled, buttonPrimary, buttonSecondary, card, colors, input, mutedText } from '@/lib/ui/theme';
import hoverStyles from '@/lib/ui/theme.module.css';
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

/**
 * Manager "Attention" feed -- currently-open Operations exceptions at the
 * Manager's own location (severity/source/note/what it belongs to/when it
 * was opened), with a resolve action (optional note). This is a new,
 * Operations-scoped feed, deliberately NOT merged into the existing
 * tenant-wide Workforce Attention panel (`../manager/attention-panel.tsx`,
 * shift requests etc.) -- that unification is a later-slice idea, not this
 * slice's scope.
 */
export function AttentionSection({ t, lang, exceptions, tasksToday, items, onChange }: AttentionSectionProps) {
  const taskByInstanceId = new Map(tasksToday.filter((task) => task.instanceId !== null).map((task) => [task.instanceId as string, task]));
  const itemById = new Map(items.map((item) => [item.itemId, item]));
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const sorted = [...(exceptions ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.exceptionId.localeCompare(b.exceptionId));

  return (
    <section style={{ ...card, marginTop: 16 }}>
      {exceptions === null ? (
        <p style={{ margin: 0, ...mutedText }}>{t('unavailable')}</p>
      ) : sorted.length === 0 ? (
        <p style={{ margin: 0, ...mutedText }}>{t('attentionNoOpenExceptions')}</p>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
          {sorted.map((exception) => {
            const task = taskByInstanceId.get(exception.instanceId) ?? null;
            const item = exception.itemId ? (itemById.get(exception.itemId) ?? null) : null;
            return (
              <li
                key={exception.exceptionId}
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
                  <strong style={{ flex: '1 1 220px' }}>{task ? task.templateName : t('attentionUnknownTask')}</strong>
                  <span style={badgeStyle(exception.severity === 'action_required' ? 'warning' : 'neutral')}>
                    {exception.severity === 'action_required' ? t('severityActionRequired') : t('severityWarning')}
                  </span>
                  <span style={badgeStyle('neutral')}>
                    {exception.source === 'threshold' ? t('attentionSourceThreshold') : t('attentionSourceReported')}
                  </span>
                </div>
                {item ? (
                  <div style={{ ...mutedText, fontSize: 12.5 }}>
                    {t('attentionItemLabel')}: {item.label}
                  </div>
                ) : null}
                {exception.note ? <p style={{ margin: 0, fontSize: 13.5 }}>{exception.note}</p> : null}
                <div style={{ ...mutedText, fontSize: 12 }}>
                  {t('attentionOpenedAtLabel')}: {new Date(exception.createdAt).toLocaleString(lang === 'ja' ? 'ja-JP' : 'en-US')}
                </div>

                {resolvingId === exception.exceptionId ? (
                  <ResolveExceptionForm
                    t={t}
                    lang={lang}
                    exceptionId={exception.exceptionId}
                    onCancel={() => setResolvingId(null)}
                    onSuccess={() => {
                      setResolvingId(null);
                      onChange();
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className={hoverStyles.buttonSecondary}
                    style={{ ...buttonSecondary, alignSelf: 'flex-start' }}
                    onClick={() => setResolvingId(exception.exceptionId)}
                  >
                    {t('resolveButton')}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <label>
        <span style={{ ...mutedText, fontSize: 13 }}>{t('resolveNoteLabel')}</span>
        <textarea
          style={{ ...input, minHeight: 70, resize: 'vertical' }}
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
          style={buttonPrimary}
          pendingStyle={buttonDisabled}
          className={hoverStyles.buttonPrimary}
          onClick={handleSubmit}
        >
          {t('resolveSubmit')}
        </LoadingButton>
        <button type="button" className={hoverStyles.buttonSecondary} style={buttonSecondary} onClick={onCancel} disabled={isPending}>
          {t('formCancel')}
        </button>
      </div>
    </div>
  );
}
