'use client';

import { useEffect, useState, useTransition } from 'react';
import type { FormEvent } from 'react';
import type { Lang } from '@/lib/demo/cafe/i18n';
import type { OperationsTemplateItem } from '@/lib/operations/templates';
import type { OperationsResponseType } from '@/lib/operations/validation';
import { addTemplateItem, replaceTemplateItem, updateTemplateItem } from '@/lib/operations/templates-actions';
import { PendingOverlay } from '@/components/ui/loading';
import { checkboxLabel, checkboxInput, input, mutedText } from '@/lib/ui/theme';
import { describeOperationsWriteError } from './error-copy';
import { tOperations } from './operations-i18n';

const RESPONSE_TYPE_OPTIONS: { value: OperationsResponseType; labelKey: 'responseTypeBoolean' | 'responseTypeNumeric' | 'responseTypeText' }[] = [
  { value: 'boolean', labelKey: 'responseTypeBoolean' },
  { value: 'numeric', labelKey: 'responseTypeNumeric' },
  { value: 'text', labelKey: 'responseTypeText' },
];

export interface ItemFormProps {
  /** `add`: a brand-new item on `templateId`. `edit`: mutable-fields-only update of `item` (response type is fixed, never rendered as an input). `replace`: retire `item` and create a fresh one -- response type IS editable here (`api.operations_replace_template_item` is the sanctioned way to change it once an item has been used). */
  mode: 'add' | 'edit' | 'replace';
  templateId: string;
  /** Required for `edit`/`replace`; ignored for `add`. */
  item?: OperationsTemplateItem;
  formId: string;
  lang: Lang;
  onSuccess: () => void;
  onPendingChange?: (pending: boolean) => void;
  onErrorChange?: (error: string | null) => void;
}

/** Add/edit/replace form for one checklist item. `responseType` drives which numeric fields are shown -- tracked in local state so toggling it live-updates the form for `add`/`replace`, matching the immutability rule enforced server-side (`operations.checklist_items_definition_guard`, 0105) rather than trying to replicate it. */
export function ItemForm({ mode, templateId, item, formId, lang, onSuccess, onPendingChange, onErrorChange }: ItemFormProps) {
  const t = (key: Parameters<typeof tOperations>[1]) => tOperations(lang, key);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [responseType, setResponseType] = useState<OperationsResponseType>(item?.responseType ?? 'boolean');

  useEffect(() => onPendingChange?.(isPending), [isPending, onPendingChange]);
  useEffect(() => onErrorChange?.(error), [error, onErrorChange]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      let result;
      if (mode === 'add') {
        formData.set('templateId', templateId);
        result = await addTemplateItem(formData);
      } else if (mode === 'edit' && item) {
        formData.set('itemId', item.itemId);
        formData.set('isNumeric', item.responseType === 'numeric' ? 'true' : 'false');
        result = await updateTemplateItem(formData);
      } else if (mode === 'replace' && item) {
        formData.set('oldItemId', item.itemId);
        result = await replaceTemplateItem(formData);
      } else {
        return;
      }
      if (result.status !== 'success') {
        setError(describeOperationsWriteError(result, lang));
        return;
      }
      onSuccess();
    });
  }

  const showResponseTypeSelect = mode === 'add' || mode === 'replace';
  const showNumericFields = responseType === 'numeric';

  return (
    <form id={formId} onSubmit={handleSubmit} style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <PendingOverlay visible={isPending} message={t('formSaving')} />
      <label>
        <span style={{ ...mutedText, fontSize: 13 }}>{t('itemLabelLabel')}</span>
        <input style={input} name="label" defaultValue={item?.label ?? ''} maxLength={200} required />
      </label>

      {showResponseTypeSelect ? (
        <label>
          <span style={{ ...mutedText, fontSize: 13 }}>{t('itemResponseTypeLabel')}</span>
          <select
            style={input}
            name="responseType"
            value={responseType}
            onChange={(event) => setResponseType(event.target.value as OperationsResponseType)}
          >
            {RESPONSE_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.labelKey)}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <div>
          <span style={{ ...mutedText, fontSize: 13 }}>{t('itemResponseTypeLabel')}</span>
          <p style={{ margin: '4px 0 0' }}>{t(RESPONSE_TYPE_OPTIONS.find((option) => option.value === responseType)?.labelKey ?? 'responseTypeText')}</p>
        </div>
      )}

      {showNumericFields ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 14 }}>
          <label>
            <span style={{ ...mutedText, fontSize: 13 }}>{t('itemNumericMinLabel')}</span>
            <input style={input} type="number" step="any" name="numericMin" defaultValue={item?.numericMin ?? ''} />
          </label>
          <label>
            <span style={{ ...mutedText, fontSize: 13 }}>{t('itemNumericMaxLabel')}</span>
            <input style={input} type="number" step="any" name="numericMax" defaultValue={item?.numericMax ?? ''} />
          </label>
          <label>
            <span style={{ ...mutedText, fontSize: 13 }}>{t('itemNumericUnitLabel')}</span>
            <input style={input} name="numericUnit" defaultValue={item?.numericUnit ?? ''} maxLength={40} />
          </label>
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        <label style={checkboxLabel}>
          <input style={checkboxInput} type="checkbox" name="isCritical" defaultChecked={item?.isCritical ?? false} />
          {t('itemCriticalLabel')}
        </label>
        <label style={checkboxLabel}>
          <input style={checkboxInput} type="checkbox" name="isRequired" defaultChecked={item?.isRequired ?? true} />
          {t('itemRequiredLabel')}
        </label>
      </div>

      <label>
        <span style={{ ...mutedText, fontSize: 13 }}>{t('itemSortOrderLabel')}</span>
        <input style={input} type="number" min={0} step={1} name="sortOrder" defaultValue={item?.sortOrder ?? 0} />
      </label>
    </form>
  );
}
