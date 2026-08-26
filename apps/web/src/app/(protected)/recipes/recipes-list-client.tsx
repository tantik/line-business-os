'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { WorkforceRecipeGroup } from '@/lib/workforce/recipes';
import type { RecipeTranslationField } from '@/lib/content/recipe-translation-workspace';
import { resolveFieldDisplay } from '@/lib/content/recipe-display';
import { deleteRecipe, getRecipesListForPoll } from '@/lib/workforce/recipe-actions';
import { LangProvider, useLang } from '@/lib/demo/cafe/i18n';
import { PreviewLanguageToggle } from '@/lib/preview/preview-language-toggle';
import { SignOutButton } from '@/components/sign-out-button';
import { ConfirmDialog } from '@/components/shared/design-kit';
import { ThumbnailImage } from '@/components/media/ThumbnailImage';
import {
  alertDanger,
  backLink,
  badgeStyle,
  buttonPrimary,
  buttonSecondary,
  card,
  colors,
  input,
  mutedText,
  pageStyle,
} from '@/lib/ui/theme';
import hoverStyles from '@/lib/ui/theme.module.css';
import { buttonDanger } from '../_ui/workforce-theme';
import { describeWriteError } from '../manager/error-copy';
import { RecipeForm } from './recipe-form';
import { RecipeDetailModal } from './recipe-detail-modal';
import { tRecipes } from './recipes-i18n';

/**
 * WP C1 (Track C, live-sync): matches the Staff dashboard's schedule poll
 * exactly (`staff-dashboard-client.tsx`'s `SCHEDULE_POLL_INTERVAL_MS`) --
 * same value, same Page-Visibility-gated/in-flight-guarded shape. Not a
 * shared exported constant (neither of the two existing poll
 * implementations was, either); kept file-local like its precedents.
 */
const RECIPES_POLL_INTERVAL_MS = 2500;

type StatusFilter = 'published' | 'draft' | 'archived';

export interface RecipesListClientProps {
  tenantName: string;
  groups: WorkforceRecipeGroup[] | null;
  /** Each recipe's title translation field, keyed by `recipeId` -- see `resolveFieldDisplay`. */
  titleFieldByRecipeId: Record<string, RecipeTranslationField>;
  /** Signed thumbnail URL for each recipe that has a photo, keyed by `recipeId` (WP-6). */
  mediaUrlByRecipeId: Record<string, string>;
  /** Pure UX affordance (RLS is the real boundary regardless): whether to show the manage toolbar (filter/search-adjacent Add-recipe control, description) and each row's Edit/Delete buttons. */
  canManage: boolean;
  /**
   * True only when rendered inside another popup (Manager's Recipes popup,
   * WP A5b, or Staff's equivalent) -- skips this component's own
   * page-level header and its own live poll (the host popup owns
   * refreshing). Defaults false.
   */
  embedded?: boolean;
  /**
   * When provided, a row click (or its "Edit" button) calls this instead
   * of navigating to `/recipes/[id]` -- used both by an `embedded` popup
   * (a same-Modal view swap) AND by the standalone `/recipes` page itself
   * (2026-08-24 Founder direction: clicking a recipe there opens it in a
   * `Modal` overlay too, `RecipeDetailModal`, rather than a full page
   * navigation -- "модуль recipes... в списке рецептов откроется попап").
   * `startEditing` opens straight into the pre-filled edit form (a row's
   * own "Edit" button) instead of the read view (a row's title/thumbnail).
   */
  onSelectRecipe?: (recipeId: string, startEditing?: boolean) => void;
  /**
   * Optional: fired on row hover/focus, before any click, so the caller
   * can kick off `getRecipeDetailForPopup` speculatively -- by the time the
   * user actually clicks, the fetch is often already resolved, masking
   * most of the detail-open latency. Pure speculative read; safe to fire
   * repeatedly, no state mutation, and the click handler's own fetch/
   * cache-check still owns correctness if the hover never fires (e.g.
   * touch/keyboard-only use).
   */
  onHoverRecipe?: (recipeId: string) => void;
  /** Required when `embedded` is true: called instead of `router.refresh()` after adding/deleting a recipe, since the popup's list data was fetched by the Manager page, not this component's own page. */
  onChange?: () => void;
}

/**
 * Outer wrapper: mounts the shared `LangProvider` around the Recipes list
 * page body, matching the same pattern the canonical Staff dashboard,
 * Admin page, and Inventory page already use.
 *
 * Owns the standalone page's own recipe-detail-in-a-`Modal` state (Founder
 * direction, 2026-08-24): a row click opens `RecipeDetailModal` as an
 * overlay on top of the still-visible list, instead of navigating to
 * `/recipes/[recipeId]` -- the URL never changes. `embedded` popups
 * (Manager/Staff's Recipes popup) don't use this: they swap their own
 * `Modal`'s content between list and detail views instead of nesting a
 * second `Modal`, so this state only matters for the standalone page.
 */
export function RecipesListClient(props: RecipesListClientProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<{ recipeId: string; startEditing: boolean } | null>(null);

  return (
    <LangProvider>
      <main style={pageStyle(880)}>
        <RecipesListBody
          {...props}
          onSelectRecipe={(recipeId, startEditing = false) => setSelected({ recipeId, startEditing })}
        />
      </main>
      <RecipeDetailModal
        recipeId={selected?.recipeId ?? null}
        startEditing={selected?.startEditing ?? false}
        onClose={() => setSelected(null)}
        onChange={() => router.refresh()}
      />
    </LangProvider>
  );
}

export function RecipesListBody({
  tenantName,
  groups,
  titleFieldByRecipeId,
  mediaUrlByRecipeId,
  canManage,
  embedded = false,
  onSelectRecipe,
  onHoverRecipe,
  onChange,
}: RecipesListClientProps) {
  const { lang } = useLang();
  const router = useRouter();
  const t = (key: Parameters<typeof tRecipes>[1]) => tRecipes(lang, key);
  const [adding, setAdding] = useState(false);
  // Manager-only Archive/Draft toggle (mutually exclusive; neither pressed
  // means "Published", the default view everyone -- including Staff, who
  // never sees this toggle at all -- gets). Recipes module redesign,
  // Cafe Manager UI/UX Parity mission, 2026-08-20 (Founder direction):
  // replaces the old category-grouped list (每 category header, no status
  // filter) -- status now organizes the list instead of category.
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('published');
  const [search, setSearch] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, startDeleteTransition] = useTransition();
  const [liveGroups, setLiveGroups] = useState(groups);
  const [liveTitleFieldByRecipeId, setLiveTitleFieldByRecipeId] = useState(titleFieldByRecipeId);
  const [liveMediaUrlByRecipeId, setLiveMediaUrlByRecipeId] = useState(mediaUrlByRecipeId);

  useEffect(() => {
    setLiveGroups(groups);
    setLiveTitleFieldByRecipeId(titleFieldByRecipeId);
    setLiveMediaUrlByRecipeId(mediaUrlByRecipeId);
  }, [groups, titleFieldByRecipeId, mediaUrlByRecipeId]);

  // Only the standalone page polls -- `embedded` (Manager's popup, WP A5b)
  // already refreshes itself via `onChange` after its own writes, and a
  // second independent poll inside an already-open Modal risks a confusing
  // race with that popup's own state.
  useEffect(() => {
    if (embedded) return;
    let cancelled = false;
    let inFlight = false;
    const poll = async () => {
      if (inFlight || document.visibilityState !== 'visible') return;
      inFlight = true;
      try {
        const result = await getRecipesListForPoll();
        if (cancelled || result.status !== 'success') return;
        setLiveGroups(result.data.groups);
        setLiveTitleFieldByRecipeId(result.data.titleFieldByRecipeId);
        setLiveMediaUrlByRecipeId(result.data.mediaUrlByRecipeId);
      } finally {
        inFlight = false;
      }
    };
    const id = setInterval(poll, RECIPES_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [embedded]);

  function recipeTitle(recipe: WorkforceRecipeGroup['recipes'][number]): string {
    const field = liveTitleFieldByRecipeId[recipe.recipeId];
    if (!field) return recipe.titleJa || recipe.titleEn || recipe.recipeId;
    return resolveFieldDisplay(field, lang).text || recipe.recipeId;
  }

  const allRecipes = useMemo(
    () => liveGroups?.flatMap((group) => group.recipes) ?? null,
    [liveGroups],
  );

  // Staff (canManage=false) never sees anything but Published, regardless of
  // `statusFilter` (which only Manager's toolbar can ever change) -- matches
  // the pre-existing "Draft recipes are not visible on Staff" rule.
  const effectiveStatusFilter: StatusFilter = canManage ? statusFilter : 'published';

  const visibleRecipes = useMemo(() => {
    if (allRecipes === null) return null;
    const searchLower = search.trim().toLowerCase();
    return allRecipes.filter((recipe) => {
      if (recipe.status !== effectiveStatusFilter) return false;
      if (!searchLower) return true;
      return recipeTitle(recipe).toLowerCase().includes(searchLower);
    });
  }, [allRecipes, effectiveStatusFilter, search, liveTitleFieldByRecipeId, lang]);

  const confirmDeleteTarget = confirmDeleteId
    ? (allRecipes?.find((r) => r.recipeId === confirmDeleteId) ?? null)
    : null;

  function handleDelete(recipeId: string) {
    setDeleteError(null);
    const formData = new FormData();
    formData.set('recipeId', recipeId);
    startDeleteTransition(async () => {
      const result = await deleteRecipe(formData);
      if (result.status === 'success') {
        if (embedded) onChange?.();
        else router.refresh();
      } else {
        setDeleteError(describeWriteError(result));
      }
    });
  }

  function editHref(recipeId: string): string {
    return `/recipes/${recipeId}?edit=1`;
  }

  return (
    <>
      {!embedded ? (
        <header>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <h1 style={{ margin: 0 }}>{t('pageTitle')}</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <PreviewLanguageToggle />
              <SignOutButton label={t('signOut')} />
            </div>
          </div>
          <p style={{ margin: '8px 0 0', ...mutedText }}>
            {t('pageDescription')} {tenantName}.
          </p>
          <Link href={canManage ? '/manager' : '/staff'} style={{ ...backLink, marginTop: 12 }}>
            {t('backToWorkforce')}
          </Link>
        </header>
      ) : null}

      {canManage ? (
        adding ? (
          <section style={card}>
            <h2 style={{ margin: 0, fontSize: 15 }}>{t('newRecipeHeading')}</h2>
            <RecipeForm
              lang={lang}
              onSuccess={() => {
                setAdding(false);
                if (embedded) onChange?.();
                else router.refresh();
              }}
              onCancel={() => setAdding(false)}
            />
          </section>
        ) : (
          <div>
            <p style={{ margin: 0, fontSize: 13, ...mutedText }}>{t('manageDescription')}</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
              <button
                type="button"
                aria-pressed={statusFilter === 'archived'}
                className={hoverStyles.buttonSecondary}
                style={
                  statusFilter === 'archived'
                    ? { ...buttonSecondary, background: colors.accentMuted, color: colors.accent }
                    : buttonSecondary
                }
                onClick={() =>
                  setStatusFilter((current) => (current === 'archived' ? 'published' : 'archived'))
                }
              >
                {t('filterArchive')}
              </button>
              <button
                type="button"
                aria-pressed={statusFilter === 'draft'}
                className={hoverStyles.buttonSecondary}
                style={
                  statusFilter === 'draft'
                    ? { ...buttonSecondary, background: colors.accentMuted, color: colors.accent }
                    : buttonSecondary
                }
                onClick={() =>
                  setStatusFilter((current) => (current === 'draft' ? 'published' : 'draft'))
                }
              >
                {t('filterDraft')}
              </button>
              <button
                type="button"
                className={hoverStyles.buttonPrimary}
                style={{ ...buttonPrimary, marginLeft: 'auto' }}
                onClick={() => setAdding(true)}
              >
                {t('addRecipeButton')}
              </button>
            </div>
          </div>
        )
      ) : null}

      {!adding ? (
        <>
          <div style={{ marginTop: 16 }}>
            <input
              type="search"
              style={input}
              placeholder={t('searchPlaceholder')}
              aria-label={t('searchPlaceholder')}
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
            />
          </div>

          {deleteError ? <div style={{ ...alertDanger, marginTop: 12 }}>{deleteError}</div> : null}

          <section style={{ ...card, marginTop: 16 }}>
            {visibleRecipes === null ? (
              <p style={{ margin: 0, ...mutedText }}>{t('unavailable')}</p>
            ) : visibleRecipes.length === 0 ? (
              <p style={{ margin: 0, ...mutedText }}>
                {search.trim() ? t('noRecipesMatchSearch') : t('noRecipesYet')}
              </p>
            ) : (
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
                {visibleRecipes.map((recipe) => {
                  function openDetail() {
                    if (onSelectRecipe) onSelectRecipe(recipe.recipeId);
                    else router.push(`/recipes/${recipe.recipeId}`);
                  }
                  return (
                    <li
                      key={recipe.recipeId}
                      role="button"
                      tabIndex={0}
                      onClick={openDetail}
                      onMouseEnter={() => onHoverRecipe?.(recipe.recipeId)}
                      onFocus={() => onHoverRecipe?.(recipe.recipeId)}
                      onPointerDown={() => onHoverRecipe?.(recipe.recipeId)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          openDetail();
                        }
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '9px 10px',
                        borderRadius: 8,
                        background: colors.surfaceElevated,
                        flexWrap: 'wrap',
                        cursor: 'pointer',
                        minWidth: 0,
                      }}
                    >
                      <ThumbnailImage
                        src={liveMediaUrlByRecipeId[recipe.recipeId]}
                        alt=""
                        size={44}
                        background={colors.surface}
                        fallback={recipe.contentKind === 'instruction' ? '🛠️' : '🍵'}
                      />
                      <div style={{ minWidth: 140, flex: '1 1 160px' }}>
                        <strong
                          style={{
                            display: 'block',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {recipeTitle(recipe)}
                        </strong>
                        <div
                          style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}
                        >
                          <span
                            style={
                              recipe.status === 'published'
                                ? badgeStyle('active')
                                : badgeStyle('neutral')
                            }
                          >
                            {recipe.status === 'published'
                              ? t('publishedBadge')
                              : recipe.status === 'archived'
                                ? t('archivedBadge')
                                : t('draftBadge')}
                          </span>
                          {recipe.contentKind === 'instruction' ? (
                            <span style={badgeStyle('neutral')}>{t('instructionBadge')}</span>
                          ) : null}
                        </div>
                      </div>
                      {canManage ? (
                        <div
                          style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}
                          onClick={(event) => event.stopPropagation()}
                        >
                          <button
                            type="button"
                            className={hoverStyles.buttonSecondary}
                            style={buttonSecondary}
                            onClick={() =>
                              onSelectRecipe ? onSelectRecipe(recipe.recipeId, true) : router.push(editHref(recipe.recipeId))
                            }
                          >
                            {t('editButton')}
                          </button>
                          <button
                            type="button"
                            className={hoverStyles.buttonSecondary}
                            style={buttonDanger}
                            onClick={() => setConfirmDeleteId(recipe.recipeId)}
                          >
                            {t('deleteButton')}
                          </button>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      ) : null}

      <ConfirmDialog
        open={confirmDeleteId !== null}
        title={t('deleteConfirmTitle')}
        confirmLabel={t('deleteButton')}
        cancelLabel={t('formCancel')}
        pending={isDeleting}
        danger
        onCancel={() => setConfirmDeleteId(null)}
        onConfirm={() => {
          const id = confirmDeleteId;
          setConfirmDeleteId(null);
          if (id) handleDelete(id);
        }}
      >
        {confirmDeleteTarget ? recipeTitle(confirmDeleteTarget) : ''}
      </ConfirmDialog>
    </>
  );
}
