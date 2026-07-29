'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { WorkforceRecipe } from '@/lib/workforce/recipes';
import type { RecipeTranslationWorkspace } from '@/lib/content/recipe-translation-workspace';
import { previewSetRecipeContentKind } from './actions/recipe-actions';
import { previewWriteMessage } from './write-result';
import { demoColors, input, mutedText } from '@/lib/demo/cafe/theme';
import { useLang } from '@/lib/demo/cafe/i18n';
import { tManager } from '@/lib/demo/cafe/i18n.manager';
import { tRecipeTranslation } from '@/lib/demo/cafe/i18n.recipe-translation';
import { PreviewRecipeTranslationPanel } from './preview-recipe-translation-panel';

export interface PreviewRecipeKindManagerProps {
  recipes: WorkforceRecipe[] | null;
  /** Precomputed translation workspace per recipe id -- preloaded server-side alongside `recipes`, never fetched on demand by this client island. */
  translationWorkspaces: Record<string, RecipeTranslationWorkspace>;
}

export function PreviewRecipeKindManager({ recipes, translationWorkspaces }: PreviewRecipeKindManagerProps) {
  const router = useRouter();
  const { lang } = useLang();
  const t = (key: Parameters<typeof tManager>[1]) => tManager(lang, key);
  const tTranslate = (key: Parameters<typeof tRecipeTranslation>[1]) => tRecipeTranslation(lang, key);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [expandedRecipeId, setExpandedRecipeId] = useState<string | null>(null);

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
      <p style={{ margin: '0 0 14px', ...mutedText }}>
        {t('recipeManagerHelp')}
      </p>
      {recipes === null ? (
        <p style={mutedText}>{t('recipeListLoadError')}</p>
      ) : recipes.length === 0 ? (
        <p style={mutedText}>{t('recipeListEmpty')}</p>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {recipes.map((recipe) => {
            const workspace = translationWorkspaces[recipe.recipeId];
            const isExpanded = expandedRecipeId === recipe.recipeId;
            return (
              <div
                key={recipe.recipeId}
                style={{ padding: '10px 12px', borderRadius: 8, background: demoColors.surfaceElevated }}
              >
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr minmax(190px, auto) auto',
                    gap: 12,
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700 }}>{recipe.titleJa || recipe.titleEn || t('recipeUntitled')}</div>
                    <div style={{ marginTop: 3, fontSize: 11.5, color: demoColors.textMuted }}>
                      {recipe.status === 'published' ? t('recipeStatusPublished') : recipe.status === 'draft' ? t('recipeStatusDraft') : t('recipeStatusArchived')}
                    </div>
                  </div>
                  <select
                    style={{ ...input, margin: 0 }}
                    value={recipe.contentKind}
                    disabled={isPending}
                    onChange={(event) => updateKind(recipe.recipeId, event.target.value as 'recipe' | 'instruction')}
                  >
                    <option value="recipe">{t('recipeKindRecipe')}</option>
                    <option value="instruction">{t('recipeKindInstruction')}</option>
                  </select>
                  {workspace ? (
                    <button
                      type="button"
                      style={{ ...input, margin: 0, width: 'auto', cursor: 'pointer' }}
                      onClick={() => setExpandedRecipeId(isExpanded ? null : recipe.recipeId)}
                    >
                      {tTranslate('translateToggle')}
                    </button>
                  ) : null}
                </div>
                {isExpanded && workspace ? (
                  <div style={{ marginTop: 10 }}>
                    <PreviewRecipeTranslationPanel recipeId={recipe.recipeId} workspace={workspace} />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
      {feedback ? <p style={{ margin: '10px 0 0', color: demoColors.dangerText }}>{feedback}</p> : null}
      {isPending ? <p style={{ margin: '10px 0 0', ...mutedText }}>{t('savingEllipsis')}</p> : null}
    </div>
  );
}
