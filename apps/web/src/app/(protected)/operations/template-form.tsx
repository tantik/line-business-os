'use client';

import { useEffect, useState, useTransition } from 'react';
import type { FormEvent } from 'react';
import type { Lang } from '@/lib/demo/cafe/i18n';
import type { OperationsTemplate } from '@/lib/operations/templates';
import { createTemplate, updateTemplate } from '@/lib/operations/templates-actions';
import { PendingOverlay } from '@/components/ui/loading';
import { checkboxLabel, input, mutedText } from '@/lib/ui/theme';
import { describeOperationsWriteError } from './error-copy';
import { tOperations } from './operations-i18n';

export interface TemplateFormProps {
  locationId: string;
  /** Omit to create a new template; pass an existing one to edit its metadata (name/category/description only -- location scope and retirement are not editable here). */
  template?: OperationsTemplate;
  formId: string;
  lang: Lang;
  onSuccess: () => void;
  onPendingChange?: (pending: boolean) => void;
  onErrorChange?: (error: string | null) => void;
}

/**
 * Create/edit form for an Operations checklist template. Location scope
 * (tenant-wide vs. this location) is only offered on create -- the RPCs
 * never allow moving an existing template between scopes
 * (`api.operations_update_template` is metadata-only, mirroring the write
 * boundary the migration comments document), so an edit never renders that
 * control.
 */
export function TemplateForm({ locationId, template, formId, lang, onSuccess, onPendingChange, onErrorChange }: TemplateFormProps) {
  const t = (key: Parameters<typeof tOperations>[1]) => tOperations(lang, key);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<'tenant' | 'location'>('tenant');

  useEffect(() => onPendingChange?.(isPending), [isPending, onPendingChange]);
  useEffect(() => onErrorChange?.(error), [error, onErrorChange]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    if (template) formData.set('templateId', template.templateId);
    if (!template) formData.set('locationId', scope === 'location' ? locationId : '');

    startTransition(async () => {
      const result = template ? await updateTemplate(formData) : await createTemplate(formData);
      if (result.status !== 'success') {
        setError(describeOperationsWriteError(result, lang));
        return;
      }
      onSuccess();
    });
  }

  return (
    <form id={formId} onSubmit={handleSubmit} style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <PendingOverlay visible={isPending} message={t('formSaving')} />
      <label>
        <span style={{ ...mutedText, fontSize: 13 }}>{t('formNameLabel')}</span>
        <input style={input} name="name" defaultValue={template?.name ?? ''} maxLength={200} required />
      </label>
      <label>
        <span style={{ ...mutedText, fontSize: 13 }}>{t('formCategoryLabel')}</span>
        <input style={input} name="category" defaultValue={template?.category ?? ''} maxLength={100} />
      </label>
      <label>
        <span style={{ ...mutedText, fontSize: 13 }}>{t('formDescriptionLabel')}</span>
        <textarea style={{ ...input, minHeight: 80 }} name="description" defaultValue={template?.description ?? ''} maxLength={2000} />
      </label>
      {!template ? (
        <div>
          <span style={{ ...mutedText, fontSize: 13 }}>{t('formLocationScopeLabel')}</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
            <label style={checkboxLabel}>
              <input type="radio" name="scope" checked={scope === 'tenant'} onChange={() => setScope('tenant')} />
              {t('formScopeTenantWide')}
            </label>
            <label style={checkboxLabel}>
              <input type="radio" name="scope" checked={scope === 'location'} onChange={() => setScope('location')} />
              {t('formScopeThisLocation')}
            </label>
          </div>
        </div>
      ) : null}
    </form>
  );
}
