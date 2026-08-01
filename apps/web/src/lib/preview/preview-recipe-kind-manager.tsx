'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { WorkforceRecipe } from '@/lib/workforce/recipes';
import { previewGetRecipeForEdit, previewUpsertRecipe, type PreviewEditableRecipeDetail } from './actions/recipe-actions';
import { previewWriteMessage } from './write-result';
import { buttonPrimary, buttonSecondary, demoColors, input, mutedText } from '@/lib/demo/cafe/theme';
import { useLang } from '@/lib/demo/cafe/i18n';
import { tManager } from '@/lib/demo/cafe/i18n.manager';

export interface PreviewRecipeKindManagerProps { recipes: WorkforceRecipe[] | null }

function badge(status: string) {
  return { display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 10.5, fontWeight: 700,
    background: status === 'published' ? demoColors.accentMuted : demoColors.goldMuted,
    color: status === 'published' ? demoColors.accentStrong : demoColors.goldDark } as const;
}

export function PreviewRecipeKindManager({ recipes }: PreviewRecipeKindManagerProps) {
  const router = useRouter();
  const { lang } = useLang();
  const t = (key: Parameters<typeof tManager>[1]) => tManager(lang, key);
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<'list' | 'add' | 'edit'>('list');
  const [detail, setDetail] = useState<PreviewEditableRecipeDetail | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  function edit(recipeId: string) {
    setFeedback(null);
    startTransition(async () => {
      const result = await previewGetRecipeForEdit(recipeId);
      if (result.status === 'success') { setDetail(result.data); setMode('edit'); }
      else setFeedback(previewWriteMessage(lang, result.status));
    });
  }

  function save(formData: FormData) {
    setFeedback(null);
    startTransition(async () => {
      const result = await previewUpsertRecipe(formData);
      if (result.status === 'success') { setDetail(null); setPhotoPreview(null); setMode('list'); router.refresh(); }
      else setFeedback(previewWriteMessage(lang, result.status));
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
        <div style={{ padding: 12, border: `1px dashed ${demoColors.border}`, borderRadius: 10, background: demoColors.surfaceElevated, display: 'grid', gap: 8 }}>
          <strong style={{ fontSize: 13 }}>{ja ? '写真' : 'Photo'}</strong>
          {(photoPreview || detail?.mediaUrl) ? <img src={photoPreview ?? detail?.mediaUrl ?? ''} alt="" style={{ width: 96, height: 72, objectFit: 'cover', borderRadius: 8, border: `1px solid ${demoColors.border}` }} /> : null}
          {recipe?.mediaPath ? <span style={{ ...mutedText, fontSize: 12 }}>{ja ? '登録済みの画像があります。新しい画像を選ぶと置き換えられます。' : 'An image is attached. Selecting a new one replaces it.'}</span> : null}
          <input name="photo" type="file" accept="image/jpeg,image/png,image/webp" style={input} onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            setPhotoPreview(file ? URL.createObjectURL(file) : null);
          }} />
          <span style={{ ...mutedText, fontSize: 11 }}>{ja ? 'JPEG・PNG・WebP、最大5MB' : 'JPEG, PNG or WebP, up to 5 MB'}</span>
          {recipe?.mediaPath ? <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}><input type="checkbox" name="removePhoto" value="true" />{ja ? '現在の画像を削除' : 'Remove current image'}</label> : null}
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
          <button type="button" style={buttonSecondary} disabled={pending} onClick={() => { setDetail(null); setPhotoPreview(null); setMode('list'); }}>{t('cancel')}</button>
          <button type="submit" style={buttonPrimary} disabled={pending}>{pending ? t('savingEllipsis') : t('save')}</button>
        </div>
      </form>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
        <p style={{ margin: 0, ...mutedText }}>{t('recipeManagerHelp')}</p>
        <button type="button" style={buttonPrimary} onClick={() => { setDetail(null); setPhotoPreview(null); setMode('add'); }}>
          {lang === 'ja' ? 'レシピを追加' : 'Add recipe'}
        </button>
      </div>
      {feedback ? <p style={{ color: demoColors.dangerText }}>{feedback}</p> : null}
      {recipes === null ? <p style={mutedText}>{t('recipeListLoadError')}</p> : recipes.length === 0 ? <p style={mutedText}>{t('recipeListEmpty')}</p> : (
        <div style={{ display: 'grid', gap: 8, maxHeight: 480, overflowY: 'auto' }}>
          {recipes.map((recipe) => (
            <div key={recipe.recipeId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 8, background: demoColors.surfaceElevated }}>
              <div style={{ width: 44, height: 44, borderRadius: 7, background: demoColors.surface, display: 'grid', placeItems: 'center', flexShrink: 0 }}>{recipe.contentKind === 'instruction' ? '🛠️' : '🍵'}</div>
              <div style={{ minWidth: 0, flex: 1 }}><strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{recipe.titleJa}</strong>
                <span style={{ ...badge(recipe.status), marginTop: 3 }}>{recipe.status === 'published' ? (lang === 'ja' ? '公開' : 'Published') : (lang === 'ja' ? '下書き' : 'Draft')}</span>
              </div>
              <button type="button" style={buttonSecondary} disabled={pending} onClick={() => edit(recipe.recipeId)}>{t('edit')}</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
