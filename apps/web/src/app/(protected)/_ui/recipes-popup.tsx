'use client';

import { useRef, useState, useTransition } from 'react';
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

type View = { kind: 'list' } | { kind: 'detail'; recipeId: string; startEditing: boolean };

/**
 * Manage-recipes popup (WP A5b, Cafe Manager parity mission): wraps the
 * existing Recipes list AND the recipe detail view -- previously two
 * separate pages (`/recipes`, `/recipes/[recipeId]`) -- as two views of the
 * SAME design-kit `Modal`, per the Founder's explicit direction that every
 * popup should look like one component, not a page navigation dressed up
 * as one. Clicking a recipe swaps the Modal's content to its detail;
 * closing the Modal (× or Escape) from detail view goes back to the list
 * instead of actually closing the popup -- see `handleClose` -- so there is
 * no separate in-body "back" control to duplicate that.
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
  // Hover-prefetch cache (2026-08-21 perf pass): keyed by recipeId, holds a
  // detail fetch that started before the manager actually clicked. Session
  // life span only (a plain ref, not persisted) -- correctness never
  // depends on it being warm, `openRecipe` below falls back to its normal
  // fetch whenever the cache has no entry yet (touch/keyboard-only use,
  // or a click that beat the hover fetch to the punch).
  const detailCacheRef = useRef(new Map<string, RecipeDetailForPopup>());

  // The list view already holds a signed URL per recipe (`mediaUrlByRecipeId`,
  // fetched once by the page). `getRecipeDetailForPopup` mints its own signed
  // URL for the same underlying file, which the browser treats as a
  // different resource (different token in the query string) and re-fetches
  // in full instead of reusing the thumbnail's cached bytes. Since the photo
  // itself hasn't changed between list and detail within the same popup
  // session, prefer the already-fetched URL whenever one exists.
  function withKnownMediaUrl(recipeId: string, detail: RecipeDetailForPopup): RecipeDetailForPopup {
    const known = mediaUrlByRecipeId[recipeId];
    return known ? { ...detail, mediaUrl: known } : detail;
  }

  function prefetchRecipe(recipeId: string) {
    if (detailCacheRef.current.has(recipeId)) return;
    getRecipeDetailForPopup(recipeId).then((result) => {
      if (result.status === 'success' && result.data) detailCacheRef.current.set(recipeId, withKnownMediaUrl(recipeId, result.data));
    });
  }

  function openRecipe(recipeId: string, startEditing = false) {
    setDetailError(null);
    setView({ kind: 'detail', recipeId, startEditing });
    const cached = detailCacheRef.current.get(recipeId);
    if (cached) {
      setDetail(cached);
      return;
    }
    setDetail(null);
    startTransition(async () => {
      const result = await getRecipeDetailForPopup(recipeId);
      if (result.status === 'success' && result.data) {
        const withUrl = withKnownMediaUrl(recipeId, result.data);
        detailCacheRef.current.set(recipeId, withUrl);
        setDetail(withUrl);
      } else {
        setDetailError(t('unavailable'));
      }
    });
  }

  function refreshDetail() {
    // Invalidate first: after an edit/translate/etc. save, the prefetch
    // cache's entry for this recipe is now stale, and `openRecipe` would
    // otherwise happily serve it back out instead of refetching.
    if (view.kind === 'detail') {
      detailCacheRef.current.delete(view.recipeId);
      openRecipe(view.recipeId);
    }
    onChange();
  }

  function backToList() {
    setView({ kind: 'list' });
    setDetail(null);
    setDetailError(null);
  }

  // The Modal's × (and Escape) now means "back" while viewing a recipe's
  // detail -- same destination the old in-body "Back to recipes" link used
  // to reach, now removed as a redundant second control -- and only
  // actually closes the whole popup from the list view. Reset to the list
  // on a real close so the next open never flashes a stale detail view.
  function handleClose() {
    if (view.kind === 'detail') {
      backToList();
      return;
    }
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
          onHoverRecipe={prefetchRecipe}
          onChange={onChange}
        />
      ) : isPending && !detail ? (
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
          <Skeleton height={60} />
        </div>
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
          initialEditing={view.kind === 'detail' && view.startEditing}
        />
      ) : null}

      <Modal open={helpOpen} onClose={() => setHelpOpen(false)} title={t('popupHelpTitle')} closeLabel={t('formCancel')} width="min(480px, 94vw)">
        <div style={{ whiteSpace: 'pre-line' }}>{t('popupHelpBody')}</div>
      </Modal>
    </Modal>
  );
}
