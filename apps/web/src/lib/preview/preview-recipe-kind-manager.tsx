'use client';

import { memo, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import type { WorkforceRecipe } from '@/lib/workforce/recipes';
import {
  previewGetRecipeForEdit,
  previewGetRecipesManagerData,
  previewListRecipeMediaUrls,
  previewPermanentlyDeleteRecipe,
  previewSetRecipeArchived,
  previewUpsertRecipe,
  type PreviewEditableRecipeDetail,
} from './actions/recipe-actions';
import { ConfirmDialog } from '@/components/demo/cafe/ConfirmDialog';
import { previewWriteMessage } from './write-result';
import { buttonPrimary, buttonSecondary, demoColors, input, mutedText } from '@/lib/demo/cafe/theme';
import { useLang } from '@/lib/demo/cafe/i18n';
import { tManager } from '@/lib/demo/cafe/i18n.manager';
import { resolveRecipeListTitle } from './recipe-list-title';
import { ThumbnailImage } from '@/components/media/ThumbnailImage';

export interface PreviewRecipeKindManagerProps {
  recipes: WorkforceRecipe[] | null;
  /**
   * Called with the freshly-refetched recipe list after a successful save/
   * archive (via `previewGetRecipesManagerData()`, never `router.refresh()`).
   * Owned by `PreviewStaffRecipeManagement` (see its comment) rather than by
   * this component, since the shared `Modal` unmounts this component on
   * close and would silently discard any state owned here. Preview Manager
   * architecture, perf phase 2.
   */
  onRecipesChanged: (next: WorkforceRecipe[]) => void;
  /**
   * Signed thumbnail URLs, keyed by `recipeId`. Owned by
   * `PreviewStaffRecipeManagement` for the same reason `recipes` is (see its
   * comment): the shared `Modal` unmounts this component on close, so any
   * URL cached here alone would be re-fetched from scratch on every reopen.
   * Pre-seeded from the page's own server-rendered load, so on a normal open
   * every thumbnail is already available with no fetch at all. Preview
   * Manager architecture, perf phase 3.
   */
  mediaUrls: Record<string, string>;
  onMediaUrlsChanged: (updater: (prev: Record<string, string>) => Record<string, string>) => void;
}

/**
 * Large-list rule (perf phase 4): the first page renders immediately, every
 * further page is revealed only once its sentinel scrolls into view. Below
 * this threshold everything renders at once (extra observer plumbing would
 * be pure overhead for a handful of rows).
 */
const RECIPE_PAGE_SIZE = 20;

function badge(status: string) {
  return { display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 10.5, fontWeight: 700,
    background: status === 'published' ? demoColors.accentMuted : demoColors.goldMuted,
    color: status === 'published' ? demoColors.accentStrong : demoColors.goldDark } as const;
}

interface RecipeRowProps {
  recipe: WorkforceRecipe;
  mediaUrl: string | undefined;
  title: string;
  pending: boolean;
  lang: 'ja' | 'en';
  editLabel: string;
  onEdit: (recipeId: string) => void;
  onRestore: (recipe: WorkforceRecipe) => void;
  onArchive: (recipe: WorkforceRecipe) => void;
  onPermanentDelete: (recipe: WorkforceRecipe) => void;
}

/**
 * Extracted and memoized so editing one recipe (or a media URL arriving for
 * one row) does not re-render every other row in the list. Perf phase 3.
 */
const RecipeRow = memo(function RecipeRow({ recipe, mediaUrl, title, pending, lang, editLabel, onEdit, onRestore, onArchive, onPermanentDelete }: RecipeRowProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 8, background: demoColors.surfaceElevated, flexWrap: 'wrap' }}>
      <ThumbnailImage
        src={mediaUrl}
        alt=""
        size={44}
        background={demoColors.surface}
        skeletonColor={demoColors.border}
        pending={Boolean(recipe.mediaPath)}
        // A row being mounted (revealed by the list's sentinel-based
        // pagination below) only means it is somewhere in the current
        // batch of up to RECIPE_PAGE_SIZE rows - not that it is on screen.
        // Most of a batch is typically still below the fold inside the
        // scroll container, so this must stay the ThumbnailImage default
        // (`lazy`) and rely on the browser's own viewport-distance
        // heuristic, same as the Staff recipe strip. Do not special-case
        // this to `eager` again: "row exists in the DOM" is not "row is
        // visible".
        fallback={recipe.contentKind === 'instruction' ? '🛠️' : '🍵'}
      />
      {/* `minWidth` kept non-zero (not 0) so a narrow viewport wraps the
          actions onto their own row instead of squeezing name/status down to
          an unreadable sliver - the row-level `flexWrap: 'wrap'` above only
          helps once this item stops trying to absorb all remaining width. */}
      <div style={{ minWidth: 140, flex: '1 1 160px' }}>
        <strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</strong>
        <span style={{ ...badge(recipe.status), marginTop: 3 }}>
          {recipe.status === 'published'
            ? (lang === 'ja' ? '公開' : 'Published')
            : recipe.status === 'archived'
              ? (lang === 'ja' ? 'アーカイブ' : 'Archived')
              : (lang === 'ja' ? '下書き' : 'Draft')}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {recipe.status === 'archived' ? (
          <>
            <button type="button" style={buttonSecondary} disabled={pending} onClick={() => onRestore(recipe)}>{lang === 'ja' ? '復元' : 'Restore'}</button>
            <button type="button" style={{ ...buttonSecondary, color: demoColors.dangerText }} disabled={pending} onClick={() => onPermanentDelete(recipe)}>{lang === 'ja' ? '完全に削除' : 'Delete permanently'}</button>
          </>
        ) : <>
          <button type="button" style={buttonSecondary} disabled={pending} onClick={() => onEdit(recipe.recipeId)}>{editLabel}</button>
          <button type="button" style={{ ...buttonSecondary, color: demoColors.dangerText }} disabled={pending} onClick={() => onArchive(recipe)}>{lang === 'ja' ? 'アーカイブ' : 'Archive'}</button>
        </>}
      </div>
    </div>
  );
});

export function PreviewRecipeKindManager({ recipes, onRecipesChanged, mediaUrls, onMediaUrlsChanged }: PreviewRecipeKindManagerProps) {
  const { lang } = useLang();
  const t = (key: Parameters<typeof tManager>[1]) => tManager(lang, key);
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<'list' | 'add' | 'edit'>('list');
  const [detail, setDetail] = useState<PreviewEditableRecipeDetail | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoName, setPhotoName] = useState<string | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<WorkforceRecipe | null>(null);
  const [permanentDeleteTarget, setPermanentDeleteTarget] = useState<WorkforceRecipe | null>(null);
  const [permanentDeleteError, setPermanentDeleteError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const photoInputRef = useRef<HTMLInputElement>(null);
  // Tracks which `mediaPath` each cached URL in `mediaUrls` was signed for,
  // so a save that replaces a recipe's photo (mediaPath changes) is detected
  // as stale and re-signed, while everything else is left untouched -
  // "generate only when necessary", not on every render/open.
  const knownMediaPaths = useRef<Record<string, string>>(
    Object.fromEntries((recipes ?? []).filter((recipe) => recipe.mediaPath).map((recipe) => [recipe.recipeId, recipe.mediaPath as string])),
  );

  useEffect(() => () => {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
  }, [photoPreview]);

  const mediaSignature = (recipes ?? []).map((recipe) => `${recipe.recipeId}:${recipe.mediaPath ?? ''}`).join('|');
  useEffect(() => {
    const withMedia = (recipes ?? []).filter((recipe) => recipe.mediaPath);
    const staleOrMissing = withMedia.filter(
      (recipe) => knownMediaPaths.current[recipe.recipeId] !== recipe.mediaPath,
    );
    if (staleOrMissing.length === 0) return;
    let cancelled = false;
    setMediaLoading(true);
    void (async () => {
      const result = await previewListRecipeMediaUrls(staleOrMissing.map((recipe) => recipe.recipeId));
      if (!cancelled && result.status === 'success') {
        for (const recipe of staleOrMissing) knownMediaPaths.current[recipe.recipeId] = recipe.mediaPath as string;
        onMediaUrlsChanged((prev) => ({ ...prev, ...result.data }));
      }
      if (!cancelled) setMediaLoading(false);
    })();
    return () => { cancelled = true; };
  }, [mediaSignature]);

  function resetPhotoState() {
    setPhotoPreview(null);
    setPhotoName(null);
    setRemovePhoto(false);
  }

  function edit(recipeId: string) {
    setFeedback(null);
    resetPhotoState();
    startTransition(async () => {
      const result = await previewGetRecipeForEdit(recipeId);
      if (result.status === 'success') { setDetail(result.data); setMode('edit'); }
      else setFeedback(previewWriteMessage(lang, result.status));
    });
  }

  async function refreshRecipes() {
    const result = await previewGetRecipesManagerData();
    if (result.status === 'success') onRecipesChanged(result.data);
  }

  function save(formData: FormData) {
    setFeedback(null);
    startTransition(async () => {
      const result = await previewUpsertRecipe(formData);
      if (result.status === 'success') {
        setDetail(null);
        resetPhotoState();
        setMode('list');
        await refreshRecipes();
      } else setFeedback(previewWriteMessage(lang, result.status));
    });
  }

  function setArchived(recipe: WorkforceRecipe, archived: boolean) {
    setFeedback(null);
    startTransition(async () => {
      const result = await previewSetRecipeArchived(recipe.recipeId, archived);
      if (result.status === 'success') {
        setArchiveTarget(null);
        await refreshRecipes();
      } else setFeedback(previewWriteMessage(lang, result.status));
    });
  }

  function permanentlyDelete(recipeId: string) {
    setPermanentDeleteError(null);
    startTransition(async () => {
      const result = await previewPermanentlyDeleteRecipe(recipeId);
      if (result.status === 'success') {
        setPermanentDeleteTarget(null);
        await refreshRecipes();
      } else {
        // Kept open (not `setPermanentDeleteTarget(null)`) on failure -- same
        // convention as Inventory's permanent-delete confirmation -- so the
        // manager sees the reason (e.g. "must be Archived first") right next
        // to the action they just tried, not after the dialog has vanished.
        setPermanentDeleteError(previewWriteMessage(lang, result.status));
      }
    });
  }

  const visibleRecipes = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (recipes ?? [])
      .filter((recipe) => (showArchived ? recipe.status === 'archived' : recipe.status !== 'archived'))
      .filter((recipe) => !query || resolveRecipeListTitle(recipe, lang).toLowerCase().includes(query));
  }, [recipes, showArchived, search, lang]);

  // Large-list rule: render the first page immediately; reveal further pages
  // as the sentinel below the list scrolls into view. Resets to one page
  // whenever the visible set changes shape (archived toggle, save/archive
  // refetch) so a shrunk list can't leave `renderCount` past its new length.
  const [renderCount, setRenderCount] = useState(RECIPE_PAGE_SIZE);
  useEffect(() => {
    setRenderCount(RECIPE_PAGE_SIZE);
  }, [visibleRecipes]);
  const renderedRecipes = visibleRecipes.slice(0, renderCount);
  const hasMoreRecipes = renderCount < visibleRecipes.length;
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!hasMoreRecipes) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setRenderCount((count) => Math.min(count + RECIPE_PAGE_SIZE, visibleRecipes.length));
        }
      },
      { root: scrollContainerRef.current, rootMargin: '120px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMoreRecipes, visibleRecipes.length]);

  if (mode !== 'list') {
    const recipe = detail?.recipe;
    const ja = lang === 'ja';
    return (
      <form action={save} encType="multipart/form-data" style={{ display: 'grid', gap: 12 }}>
        {recipe ? <input type="hidden" name="recipeId" value={recipe.recipeId} /> : null}
        <label><span style={mutedText}>{ja ? 'コンテンツ種別' : 'Content type'}</span>
          <select name="contentKind" style={input} defaultValue={recipe?.contentKind ?? 'recipe'}>
            <option value="recipe">{ja ? 'レシピ' : 'Recipe'}</option><option value="instruction">{ja ? '手順書' : 'Instructions'}</option>
          </select>
        </label>
        <label><span style={mutedText}>{ja ? 'レシピ名' : 'Recipe title'}</span>
          <input name="titleJa" style={input} required maxLength={160} defaultValue={recipe?.titleJa ?? ''} />
        </label>
        <label><span style={mutedText}>{ja ? '短い説明' : 'Short description'}</span>
          <textarea name="descriptionJa" style={{ ...input, minHeight: 70 }} maxLength={1000} defaultValue={recipe?.descriptionJa ?? ''} />
        </label>
        <div style={{ padding: 12, border: `1px solid ${demoColors.border}`, borderRadius: 10, background: demoColors.surfaceElevated, display: 'grid', gap: 8 }}>
          <strong style={{ fontSize: 13 }}>{ja ? '写真' : 'Photo'}</strong>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 84, height: 84, flexShrink: 0, borderRadius: 9, overflow: 'hidden', border: `1px solid ${demoColors.border}`, background: demoColors.surface, display: 'grid', placeItems: 'center' }}>
              {!removePhoto && (photoPreview || detail?.mediaUrl) ? (
                <img src={photoPreview ?? detail?.mediaUrl ?? ''} alt="" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : <span aria-hidden style={{ fontSize: 25 }}>{recipe?.contentKind === 'instruction' ? '🛠️' : '🍵'}</span>}
            </div>
            <div style={{ minWidth: 0, display: 'grid', gap: 7, flex: 1 }}>
              <input
                ref={photoInputRef}
                name="photo"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}
                onChange={async (event) => {
                  const file = event.currentTarget.files?.[0];
                  if (!file) {
                    setPhotoPreview(null);
                    setPhotoName(null);
                    return;
                  }
                  if (file.size > 2 * 1024 * 1024) {
                    event.currentTarget.value = '';
                    setFeedback(ja ? '画像は2MB以下にしてください。' : 'Choose an image up to 2 MB.');
                    return;
                  }
                  const objectUrl = URL.createObjectURL(file);
                  const dimensionsOk = await new Promise<boolean>((resolve) => {
                    const image = new Image();
                    image.onload = () => resolve(image.width <= 4096 && image.height <= 4096 && image.width * image.height <= 16_000_000);
                    image.onerror = () => resolve(false);
                    image.src = objectUrl;
                  });
                  if (!dimensionsOk) {
                    URL.revokeObjectURL(objectUrl);
                    event.currentTarget.value = '';
                    setFeedback(ja ? '画像は4096×4096以下、1600万画素以下にしてください。' : 'Image dimensions must be at most 4096×4096 and 16 megapixels.');
                    return;
                  }
                  setFeedback(null);
                  setPhotoPreview(objectUrl);
                  setPhotoName(file?.name ?? null);
                  setRemovePhoto(false);
                }}
              />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" style={{ ...buttonSecondary, padding: '7px 11px' }} onClick={() => photoInputRef.current?.click()}>
                  {ja ? '画像を選択' : (recipe?.mediaPath ? 'Replace image' : 'Choose image')}
                </button>
                {recipe?.mediaPath && !photoPreview ? (
                  <button type="button" style={{ ...buttonSecondary, padding: '7px 11px', color: demoColors.dangerText }} onClick={() => setRemovePhoto((value) => !value)}>
                    {removePhoto ? (ja ? '削除を取り消す' : 'Undo remove') : (ja ? '画像を削除' : 'Remove image')}
                  </button>
                ) : null}
              </div>
              <span style={{ ...mutedText, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {photoName ?? (removePhoto ? (ja ? '保存時に削除されます' : 'Will be removed when saved') : (ja ? 'JPEG・PNG・WebP、最大2MB・4096×4096' : 'JPEG, PNG or WebP, up to 2 MB and 4096×4096'))}
              </span>
            </div>
          </div>
          {removePhoto ? <input type="hidden" name="removePhoto" value="true" /> : null}
        </div>
        <label><span style={mutedText}>{ja ? '材料（1行に1つ）' : 'Ingredients (one per line)'}</span>
          <textarea name="ingredients" style={{ ...input, minHeight: 110 }} defaultValue={detail?.ingredients.map((item) => item.labelJa).join('\n') ?? ''} />
        </label>
        <label><span style={mutedText}>{ja ? '手順（1行に1ステップ）' : 'Instructions (one step per line)'}</span>
          <textarea name="steps" style={{ ...input, minHeight: 140 }} defaultValue={detail?.steps.map((item) => item.instructionJa).join('\n') ?? ''} />
        </label>
        <section style={{ padding: 12, borderRadius: 10, border: `1px solid ${demoColors.border}`, background: demoColors.surfaceElevated, display: 'grid', gap: 10 }}>
          <p style={{ ...mutedText, margin: 0, fontSize: 12 }}>{ja ? '追加メモは任意です。本文が空の場合、スタッフ画面には表示されません。' : 'Optional additional notes. If the body is empty, this block is not shown to staff.'}</p>
          <label><span style={mutedText}>{ja ? '追加見出し' : 'Additional heading'}</span>
            <input name="noteTitle" style={input} maxLength={160} defaultValue={detail?.notes[0]?.titleJa ?? ''} />
          </label>
          <label><span style={mutedText}>{ja ? '追加資料' : 'Additional materials'}</span>
            <textarea name="noteBody" style={{ ...input, minHeight: 100 }} maxLength={4000} defaultValue={detail?.notes[0]?.bodyJa ?? ''} />
          </label>
        </section>
        <label><span style={mutedText}>{ja ? 'ステータス' : 'Status'}</span>
          <select name="status" style={input} defaultValue={recipe?.status === 'published' ? 'published' : recipe?.status === 'archived' ? 'archived' : 'draft'}>
            <option value="draft">{ja ? '下書き' : 'Draft'}</option>
            <option value="published">{ja ? '公開' : 'Published'}</option>
            <option value="archived">{ja ? 'アーカイブ' : 'Archived'}</option>
          </select>
        </label>
        {feedback ? <p style={{ margin: 0, color: demoColors.dangerText }}>{feedback}</p> : null}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" style={buttonSecondary} disabled={pending} onClick={() => { setDetail(null); resetPhotoState(); setMode('list'); }}>{t('cancel')}</button>
          <button type="submit" style={buttonPrimary} disabled={pending}>{pending ? t('savingEllipsis') : t('save')}</button>
        </div>
      </form>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
        <p style={{ margin: 0, ...mutedText }}>{t('recipeManagerHelp')}</p>
        <button type="button" style={buttonPrimary} onClick={() => { setDetail(null); resetPhotoState(); setMode('add'); }}>
          {lang === 'ja' ? 'レシピを追加' : 'Add recipe'}
        </button>
      </div>
      {feedback ? <p style={{ color: demoColors.dangerText }}>{feedback}</p> : null}
      {mediaLoading ? <p style={{ margin: '0 0 8px', ...mutedText, fontSize: 12 }}>{lang === 'ja' ? '画像を読み込み中…' : 'Loading images…'}</p> : null}
      <input
        type="search"
        style={{ ...input, marginBottom: 8 }}
        placeholder={lang === 'ja' ? 'レシピ名で検索' : 'Search by recipe name'}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        aria-label={lang === 'ja' ? 'レシピ名で検索' : 'Search by recipe name'}
      />
      {recipes && recipes.some((recipe) => recipe.status === 'archived') ? (
        <button type="button" style={{ ...buttonSecondary, padding: '6px 10px', marginBottom: 8, fontSize: 12 }} onClick={() => setShowArchived((value) => !value)}>
          {showArchived ? (lang === 'ja' ? '現在のレシピを表示' : 'Show current recipes') : (lang === 'ja' ? 'アーカイブを表示' : 'Show archived')}
        </button>
      ) : null}
      {recipes === null ? (
        <p style={mutedText}>{t('recipeListLoadError')}</p>
      ) : visibleRecipes.length === 0 ? (
        <p style={mutedText}>{search.trim() ? (lang === 'ja' ? '一致するレシピはありません。' : 'No recipes match your search.') : t('recipeListEmpty')}</p>
      ) : (
        <div ref={scrollContainerRef} style={{ display: 'grid', gap: 8, maxHeight: 480, overflowY: 'auto' }}>
          {renderedRecipes.map((recipe) => (
            <RecipeRow
              key={recipe.recipeId}
              recipe={recipe}
              mediaUrl={mediaUrls[recipe.recipeId]}
              title={resolveRecipeListTitle(recipe, lang)}
              pending={pending}
              lang={lang}
              editLabel={t('edit')}
              onEdit={edit}
              onRestore={(target) => setArchived(target, false)}
              onArchive={setArchiveTarget}
              onPermanentDelete={(target) => { setPermanentDeleteError(null); setPermanentDeleteTarget(target); }}
            />
          ))}
          {hasMoreRecipes ? <div ref={sentinelRef} aria-hidden style={{ height: 1 }} /> : null}
        </div>
      )}
      <ConfirmDialog
        open={archiveTarget !== null}
        title={lang === 'ja' ? 'このレシピをアーカイブしますか？' : 'Archive this recipe?'}
        confirmLabel={lang === 'ja' ? 'アーカイブする' : 'Archive recipe'}
        cancelLabel={t('cancel')}
        pending={pending}
        danger
        onCancel={() => setArchiveTarget(null)}
        onConfirm={() => { if (archiveTarget) setArchived(archiveTarget, true); }}
      >
        {lang === 'ja' ? 'スタッフ画面から非表示になります。履歴と内容は安全のためアーカイブに保存され、後で復元できます。' : 'It will disappear from the staff screen. Its content and history are safely archived and can be restored later.'}
      </ConfirmDialog>

      {/* Always mounted with a real toggled `open` boolean, never conditionally
          mounted/unmounted by a parent ternary -- FA-05: `useRestoreFocusOnClose`
          only restores focus on an open->false transition, which a component
          removed from the tree entirely never delivers (see the Shift
          Settings Deactivate fix for the bug this pattern avoids). */}
      <ConfirmDialog
        open={permanentDeleteTarget !== null}
        title={lang === 'ja' ? 'このレシピを完全に削除しますか？' : 'Delete this recipe permanently?'}
        confirmLabel={lang === 'ja' ? '完全に削除する' : 'Delete permanently'}
        cancelLabel={t('cancel')}
        pending={pending}
        danger
        onCancel={() => { setPermanentDeleteTarget(null); setPermanentDeleteError(null); }}
        onConfirm={() => { if (permanentDeleteTarget) permanentlyDelete(permanentDeleteTarget.recipeId); }}
      >
        {permanentDeleteTarget ? (
          <p style={{ margin: 0 }}>{resolveRecipeListTitle(permanentDeleteTarget, lang)}</p>
        ) : null}
        <p style={{ margin: '8px 0 0', fontWeight: 700 }}>
          {lang === 'ja'
            ? 'この操作は取り消せません。レシピ、材料、手順、メモ、翻訳、写真がすべて完全に削除されます。'
            : 'This cannot be undone. The recipe, its ingredients, steps, notes, translations, and photo will all be permanently deleted.'}
        </p>
        {permanentDeleteError ? (
          <p style={{ margin: '10px 0 0', color: demoColors.dangerText, fontSize: 12 }}>{permanentDeleteError}</p>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}
