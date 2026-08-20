'use client';

import { useState, useTransition } from 'react';
import type { WorkforceRecipeGroup } from '@/lib/workforce/recipes';
import type { RecipeTranslationField } from '@/lib/content/recipe-translation-workspace';
import { HelpIconButton, Modal, Skeleton } from '@/components/shared/design-kit';
import { useLang } from '@/lib/demo/cafe/i18n';
import { mutedText } from '@/lib/ui/theme';
import { usePopupOpenTiming } from '@/lib/ui/popup-timing';
import { getRecipeDetailForPopup, type RecipeDetailForPopup } from '@/lib/workforce/recipe-actions';
import { RecipesListBody } from '../recipes/recipes-list-client';
import { RecipeDetailBody } from '../recipes/[recipeId]/recipe-detail-client';
import { tRecipes } from '../recipes/recipes-i18n';

export interface RecipesPopupProps {
  open: boolean;
  onClose: () => void;
  tenantName: string;
  groups: WorkforceRecipeGroup[] | null;
  titleFieldByRecipeId: Record<string, RecipeTranslationField>;
  mediaUrlByRecipeId: Record<string, string>;
  canManage: boolean;
  /** Refreshes the Manager page's own server-fetched recipe list (e.g. `router.refresh()`) -- needed after add/archive/delete since that data isn't re-fetched by this popup's own lazy detail fetch. */
  onChange: () => void;
}

type View = { kind: 'list' } | { kind: 'detail'; recipeId: string };

/**
 * Manage-recipes popup (WP A5b, Cafe Manager parity mission): wraps the
 * existing Recipes list AND the recipe detail view -- previously two
 * separate pages (`/recipes`, `/recipes/[recipeId]`) -- as two views of the
 * SAME design-kit `Modal`, per the Founder's explicit direction that every
 * popup should look like one component, not a page navigation dressed up
 * as one. Clicking a recipe swaps the Modal's content to its detail (with
 * a "back to recipes" control that swaps back), instead of navigating away.
 *
 * The list is fetched once, server-side, by `/manager/page.tsx` (same
 * reads `/recipes/page.tsx` itself makes). Recipe detail (ingredients/
 * steps/notes/translations) is fetched lazily, client-side, via
 * `getRecipeDetailForPopup` only once a specific recipe is opened --
 * fetching every recipe's full detail upfront would be wasteful for a
 * list that can grow arbitrarily large.
 */
export function RecipesPopup({ open, onClose, tenantName, groups, titleFieldByRecipeId, mediaUrlByRecipeId, canManage, onChange }: RecipesPopupProps) {
  const { lang } = useLang();
  const t = (key: Parameters<typeof tRecipes>[1]) => tRecipes(lang, key);
  usePopupOpenTiming(open, 'recipes');
  const [view, setView] = useState<View>({ kind: 'list' });
  const [detail, setDetail] = useState<RecipeDetailForPopup | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [helpOpen, setHelpOpen] = useState(false);

  function openRecipe(recipeId: string) {
    setDetailError(null);
    setDetail(null);
    setView({ kind: 'detail', recipeId });
    startTransition(async () => {
      const result = await getRecipeDetailForPopup(recipeId);
      if (result.status === 'success' && result.data) {
        setDetail(result.data);
      } else {
        setDetailError(t('unavailable'));
      }
    });
  }

  function refreshDetail() {
    if (view.kind === 'detail') openRecipe(view.recipeId);
    onChange();
  }

  function backToList() {
    setView({ kind: 'list' });
    setDetail(null);
    setDetailError(null);
  }

  // Reset to the list every time the popup fully closes, so the next open
  // never flashes a stale detail view from a previous session.
  function handleClose() {
    backToList();
    onClose();
  }

  const title = view.kind === 'list' ? t('pageTitle') : detail ? detail.recipe.titleJa || detail.recipe.titleEn || '' : t('pageTitle');

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={title}
      titleAdornment={<HelpIconButton ariaLabel={t('popupHelpAriaLabel')} onClick={() => setHelpOpen(true)} />}
      width="min(1100px, 96vw)"
      closeLabel={t('backToWorkforce')}
    >
      {view.kind === 'list' ? (
        <RecipesListBody
          tenantName={tenantName}
          groups={groups}
          titleFieldByRecipeId={titleFieldByRecipeId}
          mediaUrlByRecipeId={mediaUrlByRecipeId}
          canManage={canManage}
          embedded
          onSelectRecipe={openRecipe}
          onChange={onChange}
        />
      ) : isPending && !detail ? (
        <Skeleton />
      ) : detailError ? (
        <p style={mutedText}>{detailError}</p>
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
          onBack={backToList}
          onChange={refreshDetail}
        />
      ) : null}

      <Modal open={helpOpen} onClose={() => setHelpOpen(false)} title={t('popupHelpTitle')} closeLabel={t('formCancel')} width="min(480px, 94vw)">
        <div style={{ whiteSpace: 'pre-line' }}>{t('popupHelpBody')}</div>
      </Modal>
    </Modal>
  );
}
