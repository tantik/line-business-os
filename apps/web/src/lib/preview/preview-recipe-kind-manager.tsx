'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { WorkforceRecipe } from '@/lib/workforce/recipes';
import { previewSetRecipeContentKind } from './actions/recipe-actions';
import { previewWriteMessage } from './write-result';
import { demoColors, input, mutedText } from '@/lib/demo/cafe/theme';
import { useLang } from '@/lib/demo/cafe/i18n';
import { tManager } from '@/lib/demo/cafe/i18n.manager';

export interface PreviewRecipeKindManagerProps {
  recipes: WorkforceRecipe[] | null;
}

function statusBadgeStyle(status: string) {
  return {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 999,
    fontSize: 10.5,
    fontWeight: 700,
    background: status === 'published' ? demoColors.accentMuted : demoColors.goldMuted,
    color: status === 'published' ? demoColors.accentStrong : demoColors.goldDark,
  } as const;
}

/**
 * Manager-facing recipe list. Deliberately shows only what the current API
 * facade lets a manager write today (`content_kind`, via 0033's
 * column-restricted grant) -- no translation status, provider, or review
 * state ever surfaces here. Saving Japanese recipe text keeps the English
 * translation in sync automatically, entirely server-side; this screen has
 * no knowledge of that pipeline.
 */
export function PreviewRecipeKindManager({ recipes }: PreviewRecipeKindManagerProps) {
  const router = useRouter();
  const { lang } = useLang();
  const t = (key: Parameters<typeof tManager>[1]) => tManager(lang, key);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);

  function updateKind(recipeId: string, contentKind: 'recipe' | 'instruction') {
    const formData = new FormData();
    formData.set('recipeId', recipeId);
    formData.set('contentKind', contentKind);
    setFeedback(null);
    startTransition(async () => {
      const result = await previewSetRecipeContentKind(formData);
      if (result.status === 'success') router.refresh();
      else setFeedback(previewWriteMessage(lang, result.status));
    });
  }

  return (
    <div>
      <p style={{ margin: '0 0 14px', ...mutedText }}>{t('recipeManagerHelp')}</p>
      {recipes === null ? (
        <p style={mutedText}>{t('recipeListLoadError')}</p>
      ) : recipes.length === 0 ? (
        <p style={mutedText}>{t('recipeListEmpty')}</p>
      ) : (
        <div style={{ display: 'grid', gap: 8, maxHeight: 420, overflowY: 'auto', overflowX: 'hidden' }}>
          {recipes.map((recipe) => (
            <div
              key={recipe.recipeId}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                minWidth: 0,
                padding: '8px 10px',
                borderRadius: 8,
                background: demoColors.surfaceElevated,
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  flexShrink: 0,
                  borderRadius: 6,
                  background: demoColors.surface,
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 18,
                }}
              >
                {recipe.contentKind === 'instruction' ? '🛠️' : '☕'}
              </div>
              <div style={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <span
                    style={{
                      fontSize: 13.5,
                      fontWeight: 700,
                      color: demoColors.textPrimary,
                      minWidth: 0,
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {recipe.titleJa || recipe.titleEn || t('recipeUntitled')}
                  </span>
                  <span style={{ ...statusBadgeStyle(recipe.status), flexShrink: 0 }}>
                    {recipe.status === 'published' ? t('recipeStatusPublished') : recipe.status === 'draft' ? t('recipeStatusDraft') : t('recipeStatusArchived')}
                  </span>
                </div>
                {recipe.descriptionJa || recipe.descriptionEn ? (
                  <div
                    style={{
                      fontSize: 11.5,
                      color: demoColors.textMuted,
                      marginTop: 2,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {recipe.descriptionJa || recipe.descriptionEn}
                  </div>
                ) : null}
              </div>
              <select
                style={{ ...input, margin: 0, width: 'auto', flexShrink: 0 }}
                value={recipe.contentKind}
                disabled={isPending}
                onChange={(event) => updateKind(recipe.recipeId, event.target.value as 'recipe' | 'instruction')}
              >
                <option value="recipe">{t('recipeKindRecipe')}</option>
                <option value="instruction">{t('recipeKindInstruction')}</option>
              </select>
            </div>
          ))}
        </div>
      )}
      {feedback ? <p style={{ margin: '10px 0 0', color: demoColors.dangerText }}>{feedback}</p> : null}
      {isPending ? <p style={{ margin: '10px 0 0', ...mutedText }}>{t('savingEllipsis')}</p> : null}
    </div>
  );
}
