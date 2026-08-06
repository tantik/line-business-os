'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import type { WorkforceRecipe } from '@/lib/workforce/recipes';
import {
  previewGetRecipeForEdit,
  previewGetRecipesManagerData,
  previewListRecipeMediaUrls,
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
}

function badge(status: string) {
  return { display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 10.5, fontWeight: 700,
    background: status === 'published' ? demoColors.accentMuted : demoColors.goldMuted,
    color: status === 'published' ? demoColors.accentStrong : demoColors.goldDark } as const;
}

export function PreviewRecipeKindManager({ recipes, onRecipesChanged }: PreviewRecipeKindManagerProps) {
  const { lang } = useLang();
  const t = (key: Parameters<typeof tManager>[1]) => tManager(lang, key);
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<'list' | 'add' | 'edit'>('list');
  const [detail, setDetail] = useState<PreviewEditableRecipeDetail | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoName, setPhotoName] = useState<string | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const [mediaLoading, setMediaLoading] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<WorkforceRecipe | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
  }, [photoPreview]);

  const mediaSignature = (recipes ?? []).map((recipe) => `${recipe.recipeId}:${recipe.mediaPath ?? ''}`).join('|');
  useEffect(() => {
    const recipeIds = (recipes ?? []).filter((recipe) => recipe.mediaPath).map((recipe) => recipe.recipeId);
    if (recipeIds.length === 0) {
      setMediaUrls({});
      return;
    }
    let cancelled = false;
    setMediaLoading(true);
    void (async () => {
      const result = await previewListRecipeMediaUrls(recipeIds);
      if (!cancelled && result.status === 'success') setMediaUrls(result.data);
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
                <img src={photoPreview ?? detail?.mediaUrl ?? ''} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
          <select name="status" style={input} defaultValue={recipe?.status === 'published' ? 'published' : 'draft'}>
            <option value="draft">{ja ? '下書き' : 'Draft'}</option><option value="published">{ja ? '公開' : 'Published'}</option>
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
      {recipes && recipes.some((recipe) => recipe.status === 'archived') ? (
        <button type="button" style={{ ...buttonSecondary, padding: '6px 10px', marginBottom: 8, fontSize: 12 }} onClick={() => setShowArchived((value) => !value)}>
          {showArchived ? (lang === 'ja' ? '現在のレシピを表示' : 'Show current recipes') : (lang === 'ja' ? 'アーカイブを表示' : 'Show archived')}
        </button>
      ) : null}
      {recipes === null ? <p style={mutedText}>{t('recipeListLoadError')}</p> : recipes.filter((recipe) => showArchived ? recipe.status === 'archived' : recipe.status !== 'archived').length === 0 ? <p style={mutedText}>{t('recipeListEmpty')}</p> : (
        <div style={{ display: 'grid', gap: 8, maxHeight: 480, overflowY: 'auto' }}>
          {recipes.filter((recipe) => showArchived ? recipe.status === 'archived' : recipe.status !== 'archived').map((recipe) => (
            <div key={recipe.recipeId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 8, background: demoColors.surfaceElevated }}>
              <div style={{ width: 44, height: 44, borderRadius: 7, overflow: 'hidden', background: demoColors.surface, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                {mediaUrls[recipe.recipeId] ? <img src={mediaUrls[recipe.recipeId]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (recipe.contentKind === 'instruction' ? '🛠️' : '🍵')}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}><strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{resolveRecipeListTitle(recipe, lang)}</strong>
                <span style={{ ...badge(recipe.status), marginTop: 3 }}>{recipe.status === 'published' ? (lang === 'ja' ? '公開' : 'Published') : (lang === 'ja' ? '下書き' : 'Draft')}</span>
              </div>
              {recipe.status === 'archived' ? (
                <button type="button" style={buttonSecondary} disabled={pending} onClick={() => setArchived(recipe, false)}>{lang === 'ja' ? '復元' : 'Restore'}</button>
              ) : <>
                <button type="button" style={buttonSecondary} disabled={pending} onClick={() => edit(recipe.recipeId)}>{t('edit')}</button>
                <button type="button" style={{ ...buttonSecondary, color: demoColors.dangerText }} disabled={pending} onClick={() => setArchiveTarget(recipe)}>{lang === 'ja' ? '削除' : 'Delete'}</button>
              </>}
            </div>
          ))}
        </div>
      )}
      <ConfirmDialog
        open={archiveTarget !== null}
        title={lang === 'ja' ? 'レシピを削除しますか？' : 'Delete this recipe?'}
        confirmLabel={lang === 'ja' ? '削除する' : 'Delete recipe'}
        cancelLabel={t('cancel')}
        pending={pending}
        danger
        onCancel={() => setArchiveTarget(null)}
        onConfirm={() => { if (archiveTarget) setArchived(archiveTarget, true); }}
      >
        {lang === 'ja' ? 'スタッフ画面から非表示になります。履歴と内容は安全のためアーカイブに保存され、後で復元できます。' : 'It will disappear from the staff screen. Its content and history are safely archived and can be restored later.'}
      </ConfirmDialog>
    </div>
  );
}
