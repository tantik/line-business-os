'use client';

import { useEffect, useState } from 'react';
import { Modal, Skeleton } from '@/components/shared/design-kit';
import { mutedText } from '@/lib/ui/theme';
import { getRecipeDetailForPopup, type RecipeDetailForPopup } from '@/lib/workforce/recipe-actions';
import { useLang } from '@/lib/demo/cafe/i18n';
import { RecipeDetailBody } from './[recipeId]/recipe-detail-client';
import { tRecipes } from './recipes-i18n';

export interface RecipeDetailModalProps {
  /** `null` closes the modal (also the closed state itself -- there is no separate `open` prop). */
  recipeId: string | null;
  /** Opens straight into the edit form -- set when reached via a list row's own "Edit" button. */
  startEditing?: boolean;
  onClose: () => void;
  /** Called after a successful edit/delete so the underlying list (fetched by the standalone page's own server component) picks up the change. */
  onChange: () => void;
}

/**
 * Recipe detail as a `Modal` overlay on the standalone `/recipes` list page
 * (Founder direction, 2026-08-24: "модуль recipes... в списке рецептов
 * откроется попап") -- the list stays visible underneath, the URL never
 * changes to `/recipes/[recipeId]`. Fetches lazily via the same
 * `getRecipeDetailForPopup` the Manager/Staff Recipes popup already uses;
 * no prefetch cache here (unlike that popup) since this is a single list
 * page, not a hover-heavy dense grid -- simplest thing that works.
 */
export function RecipeDetailModal({ recipeId, startEditing = false, onClose, onChange }: RecipeDetailModalProps) {
  const { lang } = useLang();
  const t = (key: Parameters<typeof tRecipes>[1]) => tRecipes(lang, key);
  const [detail, setDetail] = useState<RecipeDetailForPopup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!recipeId) {
      setDetail(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setDetail(null);
    setError(null);
    setLoading(true);
    getRecipeDetailForPopup(recipeId).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (result.status === 'success' && result.data) setDetail(result.data);
      else setError(t('unavailable'));
    });
    return () => {
      cancelled = true;
    };
  }, [recipeId]);

  function refresh() {
    if (!recipeId) return;
    getRecipeDetailForPopup(recipeId).then((result) => {
      if (result.status === 'success' && result.data) setDetail(result.data);
    });
    onChange();
  }

  const title = detail ? detail.recipe.titleJa || detail.recipe.titleEn || '' : t('pageTitle');

  return (
    <Modal open={recipeId !== null} onClose={onClose} title={title} width="min(1100px, 96vw)" closeLabel={t('backToWorkforce')}>
      {loading ? (
        <div style={{ display: 'grid', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Skeleton circle width={64} height={64} />
            <div style={{ flex: 1, display: 'grid', gap: 8 }}>
              <Skeleton height={20} width="55%" />
              <Skeleton height={14} width="80%" />
            </div>
          </div>
          <Skeleton height={90} />
          <Skeleton height={90} />
        </div>
      ) : error ? (
        <p style={mutedText}>{error}</p>
      ) : detail ? (
        <RecipeDetailBody
          recipe={detail.recipe}
          ingredients={detail.ingredients}
          steps={detail.steps}
          notes={detail.notes}
          translationFields={detail.translationFields}
          canManage={detail.canManage}
          mediaUrl={detail.mediaUrl}
          embedded
          onBack={onClose}
          onChange={refresh}
          initialEditing={startEditing}
        />
      ) : null}
    </Modal>
  );
}
