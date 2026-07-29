'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { RecipeTranslationWorkspace, RecipeTranslationField } from '@/lib/content/recipe-translation-workspace';
import {
  previewGenerateRecipeTranslation,
  previewSaveManualRecipeTranslation,
  previewMarkRecipeTranslationReviewed,
} from './actions/recipe-translation-actions';
import { recipeTranslationWriteMessage } from './actions/recipe-translation-result';
import { badgeStyle, buttonSecondary, demoColors, input, mutedText } from '@/lib/demo/cafe/theme';
import { useLang } from '@/lib/demo/cafe/i18n';
import { tRecipeTranslation } from '@/lib/demo/cafe/i18n.recipe-translation';

const SECTION_TITLE_KEY = {
  title: 'translationSectionTitleField',
  description: 'translationSectionDescription',
  ingredients: 'translationSectionIngredients',
  steps: 'translationSectionSteps',
  notes: 'translationSectionNotes',
} as const;

function fieldStatusTone(field: RecipeTranslationField): 'active' | 'inactive' | 'neutral' | 'warning' {
  if (!field.existing) return 'inactive';
  if (field.isStale) return 'warning';
  return field.existing.status === 'reviewed' ? 'active' : 'neutral';
}

export function PreviewRecipeTranslationPanel({
  recipeId,
  workspace,
}: {
  recipeId: string;
  workspace: RecipeTranslationWorkspace;
}) {
  const router = useRouter();
  const { lang } = useLang();
  const t = (key: Parameters<typeof tRecipeTranslation>[1]) => tRecipeTranslation(lang, key);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  function draftFor(field: RecipeTranslationField): string {
    return drafts[field.key] ?? field.existing?.translatedText ?? '';
  }

  function generate() {
    setFeedback(null);
    const formData = new FormData();
    formData.set('recipeId', recipeId);
    const hasStaleReviewed = workspace.sections.some((section) =>
      section.fields.some((field) => field.isStale && field.existing?.status === 'reviewed'),
    );
    if (hasStaleReviewed) {
      if (!window.confirm(t('regenerateReviewedConfirm'))) return;
      formData.set('replaceStaleReviewed', 'true');
    }
    startTransition(async () => {
      const result = await previewGenerateRecipeTranslation(formData);
      if (result.status === 'success') {
        setFeedback(`${result.data.updatedCount} ${t('generateSummary')}`);
        router.refresh();
      } else {
        setFeedback(recipeTranslationWriteMessage(lang, result.status));
      }
    });
  }

  function saveManual(field: RecipeTranslationField, force: boolean) {
    const translatedText = draftFor(field).trim();
    if (translatedText.length === 0) {
      setFeedback(t('emptyTranslationBlocked'));
      return;
    }
    setFeedback(null);
    const formData = new FormData();
    formData.set('recipeId', recipeId);
    formData.set('sourceEntityType', field.sourceEntityType);
    formData.set('sourceEntityId', field.sourceEntityId);
    formData.set('sourceField', field.sourceField);
    formData.set('translatedText', translatedText);
    formData.set('force', force ? 'true' : 'false');
    startTransition(async () => {
      const result = await previewSaveManualRecipeTranslation(formData);
      if (result.status === 'success') {
        router.refresh();
      } else if (result.status === 'translation_requires_force') {
        if (window.confirm(t('forceOverwriteConfirm'))) {
          saveManual(field, true);
        }
      } else {
        setFeedback(recipeTranslationWriteMessage(lang, result.status));
      }
    });
  }

  function markReviewed(field: RecipeTranslationField) {
    if (!field.existing) return;
    setFeedback(null);
    const formData = new FormData();
    formData.set('recipeId', recipeId);
    formData.set('translationId', field.existing.translationId);
    startTransition(async () => {
      const result = await previewMarkRecipeTranslationReviewed(formData);
      if (result.status === 'success') router.refresh();
      else setFeedback(recipeTranslationWriteMessage(lang, result.status));
    });
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button type="button" style={buttonSecondary} disabled={isPending} onClick={generate}>
          {isPending ? t('generateButtonBusy') : t('generateButton')}
        </button>
      </div>

      {workspace.sections.map((section) =>
        section.fields.length === 0 ? null : (
          <div key={section.section} style={{ marginTop: 14 }}>
            <strong style={{ fontSize: 13 }}>{t(SECTION_TITLE_KEY[section.section])}</strong>
            <div style={{ display: 'grid', gap: 10, marginTop: 6 }}>
              {section.fields.map((field) => (
                <div
                  key={field.key}
                  style={{ padding: 10, borderRadius: 8, background: demoColors.surfaceElevated }}
                >
                  <div style={{ fontSize: 12, ...mutedText }}>{t('japaneseOriginalLabel')}</div>
                  <div style={{ marginTop: 2 }}>{field.sourceText}</div>

                  <div style={{ marginTop: 8, fontSize: 12, ...mutedText }}>{t('englishTranslationLabel')}</div>
                  <textarea
                    style={{ ...input, minHeight: 48 }}
                    value={draftFor(field)}
                    disabled={isPending}
                    onChange={(event) => setDrafts((prev) => ({ ...prev, [field.key]: event.target.value }))}
                  />

                  <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={badgeStyle(fieldStatusTone(field))}>
                      {!field.existing
                        ? t('statusNone')
                        : field.isStale
                          ? t('statusStale')
                          : field.existing.status === 'reviewed'
                            ? t('statusReviewed')
                            : t('statusMachine')}
                    </span>
                    {field.existing ? (
                      <span style={{ fontSize: 11.5, ...mutedText }}>
                        {t('providerLabel')}: {field.existing.provider} · {t('translatedAtLabel')}:{' '}
                        {new Date(field.existing.translatedAt).toLocaleString(lang === 'ja' ? 'ja-JP' : 'en-US')}
                      </span>
                    ) : null}
                  </div>

                  <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      style={buttonSecondary}
                      disabled={isPending}
                      onClick={() => saveManual(field, false)}
                    >
                      {isPending ? t('saveButtonBusy') : t('saveButton')}
                    </button>
                    {field.existing && field.existing.status !== 'reviewed' ? (
                      <button
                        type="button"
                        style={buttonSecondary}
                        disabled={isPending}
                        onClick={() => markReviewed(field)}
                      >
                        {isPending ? t('markReviewedButtonBusy') : t('markReviewedButton')}
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ),
      )}

      {feedback ? <p style={{ margin: '10px 0 0', color: demoColors.dangerText }}>{feedback}</p> : null}
    </div>
  );
}
