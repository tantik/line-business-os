'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { WorkforceRecipe } from '@/lib/workforce/recipes';
import { previewSetRecipeContentKind } from './actions/recipe-actions';
import { previewWriteMessage } from './write-result';
import { buttonPrimary, buttonSecondary, demoColors, input, mutedText } from '@/lib/demo/cafe/theme';
import { useLang } from '@/lib/demo/cafe/i18n';
import { tManager } from '@/lib/demo/cafe/i18n.manager';
import { Modal } from '@/components/demo/cafe/Modal';

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
  const [editing, setEditing] = useState<WorkforceRecipe | null>(null);
  const [pendingKind, setPendingKind] = useState<'recipe' | 'instruction'>('recipe');

  function openEdit(recipe: WorkforceRecipe) {
    setFeedback(null);
    setPendingKind(recipe.contentKind);
    setEditing(recipe);
  }

  function saveKind() {
    if (!editing) return;
    const formData = new FormData();
    formData.set('recipeId', editing.recipeId);
    formData.set('contentKind', pendingKind);
    setFeedback(null);
    startTransition(async () => {
      const result = await previewSetRecipeContentKind(formData);
      if (result.status === 'success') {
        setEditing(null);
        router.refresh();
      } else {
        setFeedback(previewWriteMessage(lang, result.status));
      }
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
            <button
              type="button"
              key={recipe.recipeId}
              onClick={() => openEdit(recipe)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                minWidth: 0,
                width: '100%',
                textAlign: 'left',
                cursor: 'pointer',
                padding: '8px 10px',
                border: 'none',
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
            </button>
          ))}
        </div>
      )}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.titleJa || editing?.titleEn || t('recipeUntitled')}
        maxWidth={420}
      >
        {editing ? (
          <div style={{ display: 'grid', gap: 12 }}>
            {editing.descriptionJa || editing.descriptionEn ? (
              <p style={{ margin: 0, fontSize: 13, ...mutedText }}>{editing.descriptionJa || editing.descriptionEn}</p>
            ) : null}
            <label>
              <span style={{ ...mutedText, fontSize: 12 }}>{t('recipeKindRecipe')} / {t('recipeKindInstruction')}</span>
              <select
                style={{ ...input, margin: 0, marginTop: 4 }}
                value={pendingKind}
                disabled={isPending}
                onChange={(event) => setPendingKind(event.target.value as 'recipe' | 'instruction')}
              >
                <option value="recipe">{t('recipeKindRecipe')}</option>
                <option value="instruction">{t('recipeKindInstruction')}</option>
              </select>
            </label>
            {feedback ? <p style={{ margin: 0, color: demoColors.dangerText, fontSize: 12.5 }}>{feedback}</p> : null}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" style={buttonSecondary} onClick={() => setEditing(null)} disabled={isPending}>
                {t('cancel')}
              </button>
              <button type="button" style={buttonPrimary} onClick={saveKind} disabled={isPending}>
                {isPending ? t('savingEllipsis') : t('save')}
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
