'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { WorkforceRecipe } from '@/lib/workforce/recipes';
import { previewSetRecipeContentKind } from './actions/recipe-actions';
import { previewWriteMessageJa } from './write-result';
import { demoColors, input, mutedText } from '@/lib/demo/cafe/theme';

export function PreviewRecipeKindManager({ recipes }: { recipes: WorkforceRecipe[] | null }) {
  const router = useRouter();
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
      else setFeedback(previewWriteMessageJa(result.status));
    });
  }

  return (
    <div>
      <p style={{ margin: '0 0 14px', ...mutedText }}>
        店舗のレシピと業務手順を管理します。インストラクションはスタッフ画面の先頭に表示されます。
      </p>
      {recipes === null ? (
        <p style={mutedText}>一覧を取得できません。</p>
      ) : recipes.length === 0 ? (
        <p style={mutedText}>レシピがまだ登録されていません。</p>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {recipes.map((recipe) => (
            <div
              key={recipe.recipeId}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr minmax(190px, auto)',
                gap: 12,
                alignItems: 'center',
                padding: '10px 12px',
                borderRadius: 8,
                background: demoColors.surfaceElevated,
              }}
            >
              <div>
                <div style={{ fontWeight: 700 }}>{recipe.titleJa || recipe.titleEn || '名称未設定'}</div>
                <div style={{ marginTop: 3, fontSize: 11.5, color: demoColors.textMuted }}>
                  {recipe.status === 'published' ? '公開中' : recipe.status === 'draft' ? '下書き' : 'アーカイブ'}
                </div>
              </div>
              <select
                style={{ ...input, margin: 0 }}
                value={recipe.contentKind}
                disabled={isPending}
                onChange={(event) => updateKind(recipe.recipeId, event.target.value as 'recipe' | 'instruction')}
              >
                <option value="recipe">レシピ ★</option>
                <option value="instruction">インストラクション ⓘ</option>
              </select>
            </div>
          ))}
        </div>
      )}
      {feedback ? <p style={{ margin: '10px 0 0', color: demoColors.dangerText }}>{feedback}</p> : null}
      {isPending ? <p style={{ margin: '10px 0 0', ...mutedText }}>保存中…</p> : null}
    </div>
  );
}
