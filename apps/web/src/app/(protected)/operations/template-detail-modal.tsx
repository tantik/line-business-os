'use client';

import { useState, useTransition } from 'react';
import type { Lang } from '@/lib/demo/cafe/i18n';
import type { OperationsTemplate, OperationsTemplateItem } from '@/lib/operations/templates';
import { retireTemplate, retireTemplateItem } from '@/lib/operations/templates-actions';
import type { OperationsSchedule } from '@/lib/operations/schedules';
import { cancelSchedule, deactivateSchedule } from '@/lib/operations/schedules-actions';
import { ConfirmDialog, Modal } from '@/components/shared/design-kit';
import { LoadingButton } from '@/components/ui/loading';
import {
  alertDanger,
  badgeStyle,
  buttonDisabled,
  buttonPrimary,
  buttonSecondary,
  colors,
  mutedText,
} from '@/lib/ui/theme';
import hoverStyles from '@/lib/ui/theme.module.css';
import { buttonDanger } from '../_ui/workforce-theme';
import { describeOperationsWriteError } from './error-copy';
import { tOperations } from './operations-i18n';
import { TemplateForm } from './template-form';
import { ItemForm } from './item-form';
import { ScheduleForm } from './schedule-form';

type View =
  | { kind: 'overview' }
  | { kind: 'edit-template' }
  | { kind: 'add-item' }
  | { kind: 'edit-item'; itemId: string }
  | { kind: 'replace-item'; itemId: string }
  | { kind: 'add-schedule' }
  | { kind: 'revise-schedule'; scheduleId: string };

export interface TemplateDetailModalProps {
  open: boolean;
  onClose: () => void;
  template: OperationsTemplate;
  items: OperationsTemplateItem[];
  /** Every schedule the caller may see (any template, any group). Filtered to this template's current-per-group versions internally. */
  schedules: OperationsSchedule[];
  locationId: string;
  lang: Lang;
  onChange: () => void;
}

function weekdayLabel(t: (key: Parameters<typeof tOperations>[1]) => string, day: number): string {
  const keys = ['weekdayMon', 'weekdayTue', 'weekdayWed', 'weekdayThu', 'weekdayFri', 'weekdaySat', 'weekdaySun'] as const;
  return t(keys[day - 1] ?? 'weekdayMon');
}

function recurrenceSummary(t: (key: Parameters<typeof tOperations>[1]) => string, schedule: OperationsSchedule): string {
  if (schedule.recurrenceKind === 'daily') return t('recurrenceDaily');
  const days = (schedule.weekdays ?? []).map((d) => weekdayLabel(t, d));
  return `${t('recurrenceWeekdays')}: ${days.join(t('weekdaySeparator'))}`;
}

/** Per `scheduleGroupId`, the current/latest version (highest `effectiveFrom`) -- this slice shows only the current version per logical schedule, not a full version-history browser (out of scope). ISO date strings sort lexically the same as chronologically. */
function currentSchedulesForTemplate(schedules: OperationsSchedule[], templateId: string): OperationsSchedule[] {
  const relevant = schedules.filter((s) => s.templateId === templateId);
  const byGroup = new Map<string, OperationsSchedule>();
  for (const schedule of relevant) {
    const existing = byGroup.get(schedule.scheduleGroupId);
    if (!existing || schedule.effectiveFrom > existing.effectiveFrom) byGroup.set(schedule.scheduleGroupId, schedule);
  }
  return Array.from(byGroup.values()).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom) || a.scheduleId.localeCompare(b.scheduleId));
}

type ScheduleState = 'active' | 'scheduled' | 'retired';

function scheduleState(schedule: OperationsSchedule): ScheduleState {
  const today = new Date().toISOString().slice(0, 10);
  if (!schedule.isActive || (schedule.effectiveTo !== null && schedule.effectiveTo < today)) return 'retired';
  if (schedule.effectiveFrom > today) return 'scheduled';
  return 'active';
}

function responseTypeLabel(t: (key: Parameters<typeof tOperations>[1]) => string, responseType: OperationsTemplateItem['responseType']): string {
  if (responseType === 'boolean') return t('responseTypeBoolean');
  if (responseType === 'numeric') return t('responseTypeNumeric');
  return t('responseTypeText');
}

/**
 * Template detail: view/edit a template's metadata, retire it, and manage
 * its checklist items (add/edit/retire/replace) -- all inside one `Modal`
 * with an internal view-swap, mirroring `manage-staff-popup.tsx`'s
 * list/add/detail shape. Item CRUD swaps the same Modal body between
 * `overview` and a form view rather than nesting a second `Modal` (the
 * shared `Modal`/`ConfirmDialog` shell is not designed to nest two
 * independent `Modal`s at once).
 */
export function TemplateDetailModal({ open, onClose, template, items, schedules, locationId, lang, onChange }: TemplateDetailModalProps) {
  const t = (key: Parameters<typeof tOperations>[1]) => tOperations(lang, key);
  const [view, setView] = useState<View>({ kind: 'overview' });
  const [formPending, setFormPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmRetireTemplateOpen, setConfirmRetireTemplateOpen] = useState(false);
  const [isRetireTemplatePending, startRetireTemplateTransition] = useTransition();
  const [retireTemplateError, setRetireTemplateError] = useState<string | null>(null);
  const [confirmRetireItemId, setConfirmRetireItemId] = useState<string | null>(null);
  const [isRetireItemPending, startRetireItemTransition] = useTransition();
  const [retireItemError, setRetireItemError] = useState<string | null>(null);
  const [confirmDeactivateScheduleId, setConfirmDeactivateScheduleId] = useState<string | null>(null);
  const [isDeactivateSchedulePending, startDeactivateScheduleTransition] = useTransition();
  const [deactivateScheduleError, setDeactivateScheduleError] = useState<string | null>(null);
  const [confirmCancelScheduleId, setConfirmCancelScheduleId] = useState<string | null>(null);
  const [isCancelSchedulePending, startCancelScheduleTransition] = useTransition();
  const [cancelScheduleError, setCancelScheduleError] = useState<string | null>(null);

  const sortedItems = [...items].sort((a, b) => a.sortOrder - b.sortOrder || a.itemId.localeCompare(b.itemId));
  const editingItem = view.kind === 'edit-item' ? sortedItems.find((i) => i.itemId === view.itemId) : undefined;
  const replacingItem = view.kind === 'replace-item' ? sortedItems.find((i) => i.itemId === view.itemId) : undefined;
  const templateSchedules = currentSchedulesForTemplate(schedules, template.templateId);
  const revisingSchedule = view.kind === 'revise-schedule' ? templateSchedules.find((s) => s.scheduleId === view.scheduleId) : undefined;

  function backToOverview() {
    setFormError(null);
    setFormPending(false);
    setView({ kind: 'overview' });
  }

  function handleModalClose() {
    if (view.kind !== 'overview') {
      backToOverview();
      return;
    }
    onClose();
  }

  function handleRetireTemplate() {
    setRetireTemplateError(null);
    const formData = new FormData();
    formData.set('templateId', template.templateId);
    startRetireTemplateTransition(async () => {
      const result = await retireTemplate(formData);
      setConfirmRetireTemplateOpen(false);
      if (result.status === 'success') {
        onChange();
      } else {
        setRetireTemplateError(describeOperationsWriteError(result, lang));
      }
    });
  }

  function handleRetireItem(itemId: string) {
    setRetireItemError(null);
    const formData = new FormData();
    formData.set('itemId', itemId);
    startRetireItemTransition(async () => {
      const result = await retireTemplateItem(formData);
      setConfirmRetireItemId(null);
      if (result.status === 'success') {
        onChange();
      } else {
        setRetireItemError(describeOperationsWriteError(result, lang));
      }
    });
  }

  function handleDeactivateSchedule(scheduleId: string) {
    setDeactivateScheduleError(null);
    const formData = new FormData();
    formData.set('scheduleId', scheduleId);
    startDeactivateScheduleTransition(async () => {
      const result = await deactivateSchedule(formData);
      setConfirmDeactivateScheduleId(null);
      if (result.status === 'success') {
        onChange();
      } else {
        setDeactivateScheduleError(describeOperationsWriteError(result, lang));
      }
    });
  }

  function handleCancelSchedule(scheduleId: string) {
    setCancelScheduleError(null);
    const formData = new FormData();
    formData.set('scheduleId', scheduleId);
    startCancelScheduleTransition(async () => {
      const result = await cancelSchedule(formData);
      setConfirmCancelScheduleId(null);
      if (result.status === 'success') {
        onChange();
      } else {
        setCancelScheduleError(describeOperationsWriteError(result, lang));
      }
    });
  }

  const title =
    view.kind === 'overview'
      ? template.name
      : view.kind === 'edit-template'
        ? t('editTemplateHeading')
        : view.kind === 'add-item'
          ? t('newItemHeading')
          : view.kind === 'edit-item'
            ? t('editItemHeading')
            : view.kind === 'replace-item'
              ? t('replaceItemHeading')
              : view.kind === 'add-schedule'
                ? t('newScheduleHeading')
                : t('reviseScheduleHeading');

  return (
    <Modal open={open} onClose={handleModalClose} title={title} width="min(760px, 96vw)" closeLabel={t('formCancel')}>
      {view.kind === 'edit-template' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <TemplateForm
            locationId={locationId}
            template={template}
            formId="operations-template-edit-form"
            lang={lang}
            onSuccess={() => {
              backToOverview();
              onChange();
            }}
            onPendingChange={setFormPending}
            onErrorChange={setFormError}
          />
          {formError ? <div style={alertDanger}>{formError}</div> : null}
          <div style={{ display: 'flex', gap: 8 }}>
            <LoadingButton
              type="submit"
              form="operations-template-edit-form"
              pending={formPending}
              pendingLabel={t('formSaving')}
              style={buttonPrimary}
              pendingStyle={buttonDisabled}
              className={hoverStyles.buttonPrimary}
            >
              {t('formSaveChanges')}
            </LoadingButton>
            <button type="button" className={hoverStyles.buttonSecondary} style={buttonSecondary} onClick={backToOverview} disabled={formPending}>
              {t('formCancel')}
            </button>
          </div>
        </div>
      ) : view.kind === 'add-item' || (view.kind === 'edit-item' && editingItem) ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <ItemForm
            mode={view.kind === 'add-item' ? 'add' : 'edit'}
            templateId={template.templateId}
            item={editingItem}
            formId="operations-item-form"
            lang={lang}
            onSuccess={() => {
              backToOverview();
              onChange();
            }}
            onPendingChange={setFormPending}
            onErrorChange={setFormError}
          />
          {formError ? <div style={alertDanger}>{formError}</div> : null}
          <div style={{ display: 'flex', gap: 8 }}>
            <LoadingButton
              type="submit"
              form="operations-item-form"
              pending={formPending}
              pendingLabel={t('formSaving')}
              style={buttonPrimary}
              pendingStyle={buttonDisabled}
              className={hoverStyles.buttonPrimary}
            >
              {view.kind === 'add-item' ? t('formAddItem') : t('formSaveItem')}
            </LoadingButton>
            <button type="button" className={hoverStyles.buttonSecondary} style={buttonSecondary} onClick={backToOverview} disabled={formPending}>
              {t('formCancel')}
            </button>
          </div>
        </div>
      ) : view.kind === 'replace-item' && replacingItem ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <p style={{ margin: 0, ...mutedText, fontSize: 13.5, lineHeight: 1.55 }}>{t('replaceItemIntro')}</p>
          <ItemForm
            mode="replace"
            templateId={template.templateId}
            item={replacingItem}
            formId="operations-item-replace-form"
            lang={lang}
            onSuccess={() => {
              backToOverview();
              onChange();
            }}
            onPendingChange={setFormPending}
            onErrorChange={setFormError}
          />
          {formError ? <div style={alertDanger}>{formError}</div> : null}
          <div style={{ display: 'flex', gap: 8 }}>
            <LoadingButton
              type="submit"
              form="operations-item-replace-form"
              pending={formPending}
              pendingLabel={t('formSaving')}
              style={buttonDanger}
              pendingStyle={buttonDisabled}
              className={hoverStyles.buttonDanger}
            >
              {t('formSaveReplaceItem')}
            </LoadingButton>
            <button type="button" className={hoverStyles.buttonSecondary} style={buttonSecondary} onClick={backToOverview} disabled={formPending}>
              {t('formCancel')}
            </button>
          </div>
        </div>
      ) : (view.kind === 'add-schedule' || (view.kind === 'revise-schedule' && revisingSchedule)) ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <ScheduleForm
            mode={view.kind === 'add-schedule' ? 'create' : 'revise'}
            locationId={locationId}
            templateId={template.templateId}
            schedule={revisingSchedule}
            formId="operations-schedule-form"
            lang={lang}
            onSuccess={() => {
              backToOverview();
              onChange();
            }}
            onPendingChange={setFormPending}
            onErrorChange={setFormError}
          />
          {formError ? <div style={alertDanger}>{formError}</div> : null}
          <div style={{ display: 'flex', gap: 8 }}>
            <LoadingButton
              type="submit"
              form="operations-schedule-form"
              pending={formPending}
              pendingLabel={t('formSaving')}
              style={buttonPrimary}
              pendingStyle={buttonDisabled}
              className={hoverStyles.buttonPrimary}
            >
              {view.kind === 'add-schedule' ? t('formCreateSchedule') : t('formSaveRevision')}
            </LoadingButton>
            <button type="button" className={hoverStyles.buttonSecondary} style={buttonSecondary} onClick={backToOverview} disabled={formPending}>
              {t('formCancel')}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={badgeStyle(template.isActive ? 'active' : 'inactive')}>
              {template.isActive ? t('templateActiveBadge') : t('templateRetiredBadge')}
            </span>
            <span style={badgeStyle('neutral')}>
              {template.locationId === null ? t('templateScopeTenantWide') : t('templateScopeLocation')}
            </span>
            {template.category ? <span style={badgeStyle('neutral')}>{template.category}</span> : null}
          </div>

          {template.description ? <p style={{ margin: 0 }}>{template.description}</p> : null}

          {retireTemplateError ? <div style={alertDanger}>{retireTemplateError}</div> : null}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className={hoverStyles.buttonSecondary} style={buttonSecondary} onClick={() => setView({ kind: 'edit-template' })}>
              {t('editButton')}
            </button>
            {template.isActive ? (
              <LoadingButton
                type="button"
                pending={isRetireTemplatePending}
                pendingLabel={t('formSaving')}
                style={buttonDanger}
                pendingStyle={buttonDisabled}
                className={hoverStyles.buttonDanger}
                onClick={() => setConfirmRetireTemplateOpen(true)}
              >
                {t('retireButton')}
              </LoadingButton>
            ) : null}
          </div>

          <section style={{ paddingTop: 12, borderTop: `1px solid ${colors.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0, fontSize: 15 }}>{t('itemsHeading')}</h3>
              {template.isActive ? (
                <button type="button" className={hoverStyles.buttonPrimary} style={buttonPrimary} onClick={() => setView({ kind: 'add-item' })}>
                  {t('addItemButton')}
                </button>
              ) : null}
            </div>

            {retireItemError ? <div style={{ ...alertDanger, marginTop: 10 }}>{retireItemError}</div> : null}

            {sortedItems.length === 0 ? (
              <p style={{ margin: '12px 0 0', ...mutedText }}>{t('noItemsYet')}</p>
            ) : (
              <ul style={{ margin: '12px 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
                {sortedItems.map((itemRow) => (
                  <li
                    key={itemRow.itemId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '9px 10px',
                      borderRadius: 8,
                      background: colors.surfaceElevated,
                      flexWrap: 'wrap',
                      opacity: itemRow.isActive ? 1 : 0.65,
                    }}
                  >
                    <div style={{ minWidth: 160, flex: '1 1 200px' }}>
                      <strong style={{ display: 'block' }}>{itemRow.label}</strong>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                        <span style={badgeStyle('neutral')}>{responseTypeLabel(t, itemRow.responseType)}</span>
                        {itemRow.responseType === 'numeric' && (itemRow.numericMin !== null || itemRow.numericMax !== null) ? (
                          <span style={badgeStyle('neutral')}>
                            {itemRow.numericMin ?? '—'}–{itemRow.numericMax ?? '—'} {itemRow.numericUnit ?? ''}
                          </span>
                        ) : null}
                        {itemRow.isCritical ? <span style={badgeStyle('warning')}>{t('criticalBadge')}</span> : null}
                        <span style={badgeStyle(itemRow.isRequired ? 'neutral' : 'inactive')}>
                          {itemRow.isRequired ? t('requiredBadge') : t('optionalBadge')}
                        </span>
                        {!itemRow.isActive ? <span style={badgeStyle('inactive')}>{t('retiredItemBadge')}</span> : null}
                      </div>
                    </div>
                    {itemRow.isActive && template.isActive ? (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className={hoverStyles.buttonSecondary}
                          style={buttonSecondary}
                          onClick={() => setView({ kind: 'edit-item', itemId: itemRow.itemId })}
                        >
                          {t('editButton')}
                        </button>
                        <button
                          type="button"
                          className={hoverStyles.buttonSecondary}
                          style={buttonSecondary}
                          onClick={() => setView({ kind: 'replace-item', itemId: itemRow.itemId })}
                        >
                          {t('replaceItemButton')}
                        </button>
                        <button
                          type="button"
                          className={hoverStyles.buttonSecondary}
                          style={buttonDanger}
                          onClick={() => setConfirmRetireItemId(itemRow.itemId)}
                        >
                          {t('retireItemButton')}
                        </button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section style={{ paddingTop: 12, borderTop: `1px solid ${colors.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0, fontSize: 15 }}>{t('schedulesHeading')}</h3>
              {template.isActive ? (
                <button type="button" className={hoverStyles.buttonPrimary} style={buttonPrimary} onClick={() => setView({ kind: 'add-schedule' })}>
                  {t('addScheduleButton')}
                </button>
              ) : null}
            </div>

            {deactivateScheduleError ? <div style={{ ...alertDanger, marginTop: 10 }}>{deactivateScheduleError}</div> : null}
            {cancelScheduleError ? <div style={{ ...alertDanger, marginTop: 10 }}>{cancelScheduleError}</div> : null}

            {templateSchedules.length === 0 ? (
              <p style={{ margin: '12px 0 0', ...mutedText }}>{t('noSchedulesYet')}</p>
            ) : (
              <ul style={{ margin: '12px 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
                {templateSchedules.map((schedule) => {
                  const state = scheduleState(schedule);
                  return (
                    <li
                      key={schedule.scheduleId}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '9px 10px',
                        borderRadius: 8,
                        background: colors.surfaceElevated,
                        flexWrap: 'wrap',
                        opacity: state === 'retired' ? 0.65 : 1,
                      }}
                    >
                      <div style={{ minWidth: 200, flex: '1 1 240px' }}>
                        <strong style={{ display: 'block' }}>{recurrenceSummary(t, schedule)}</strong>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                          <span style={badgeStyle('neutral')}>
                            {t('dueTimeLabel')}: {schedule.dueTime.slice(0, 5)}
                            {schedule.windowEndTime ? ` – ${schedule.windowEndTime.slice(0, 5)}` : ''}
                          </span>
                          <span style={badgeStyle('neutral')}>
                            {t('effectiveFromLabel')}: {schedule.effectiveFrom}
                          </span>
                          <span style={badgeStyle(state === 'active' ? 'active' : state === 'scheduled' ? 'neutral' : 'inactive')}>
                            {state === 'active' ? t('scheduleActiveBadge') : state === 'scheduled' ? t('scheduleScheduledBadge') : t('scheduleRetiredBadge')}
                          </span>
                        </div>
                      </div>
                      {state === 'active' ? (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className={hoverStyles.buttonSecondary}
                            style={buttonSecondary}
                            onClick={() => setView({ kind: 'revise-schedule', scheduleId: schedule.scheduleId })}
                          >
                            {t('reviseButton')}
                          </button>
                          <button
                            type="button"
                            className={hoverStyles.buttonSecondary}
                            style={buttonDanger}
                            onClick={() => setConfirmDeactivateScheduleId(schedule.scheduleId)}
                          >
                            {t('deactivateButton')}
                          </button>
                        </div>
                      ) : state === 'scheduled' ? (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className={hoverStyles.buttonSecondary}
                            style={buttonDanger}
                            onClick={() => setConfirmCancelScheduleId(schedule.scheduleId)}
                          >
                            {t('cancelRevisionButton')}
                          </button>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <ConfirmDialog
            open={confirmDeactivateScheduleId !== null}
            title={t('confirmDeactivateScheduleTitle')}
            confirmLabel={t('deactivateButton')}
            cancelLabel={t('formCancel')}
            pending={isDeactivateSchedulePending}
            danger
            onCancel={() => setConfirmDeactivateScheduleId(null)}
            onConfirm={() => {
              if (confirmDeactivateScheduleId) handleDeactivateSchedule(confirmDeactivateScheduleId);
            }}
          >
            {t('confirmDeactivateScheduleBody')}
          </ConfirmDialog>

          <ConfirmDialog
            open={confirmCancelScheduleId !== null}
            title={t('confirmCancelScheduleTitle')}
            confirmLabel={t('cancelRevisionButton')}
            cancelLabel={t('formCancel')}
            pending={isCancelSchedulePending}
            danger
            onCancel={() => setConfirmCancelScheduleId(null)}
            onConfirm={() => {
              if (confirmCancelScheduleId) handleCancelSchedule(confirmCancelScheduleId);
            }}
          >
            {t('confirmCancelScheduleBody')}
          </ConfirmDialog>

          <ConfirmDialog
            open={confirmRetireTemplateOpen}
            title={t('confirmRetireTemplateTitle')}
            confirmLabel={t('retireButton')}
            cancelLabel={t('formCancel')}
            pending={isRetireTemplatePending}
            danger
            onCancel={() => setConfirmRetireTemplateOpen(false)}
            onConfirm={handleRetireTemplate}
          >
            {t('confirmRetireTemplateBody')}
          </ConfirmDialog>

          <ConfirmDialog
            open={confirmRetireItemId !== null}
            title={t('confirmRetireItemTitle')}
            confirmLabel={t('retireItemButton')}
            cancelLabel={t('formCancel')}
            pending={isRetireItemPending}
            danger
            onCancel={() => setConfirmRetireItemId(null)}
            onConfirm={() => {
              if (confirmRetireItemId) handleRetireItem(confirmRetireItemId);
            }}
          >
            {t('confirmRetireItemBody')}
          </ConfirmDialog>
        </div>
      )}
    </Modal>
  );
}
