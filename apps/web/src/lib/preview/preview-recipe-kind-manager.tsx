'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { WorkforceRecipe } from '@/lib/workforce/recipes';
import { previewSetRecipeContentKind } from './actions/recipe-actions';
import { previewWriteMessageJa } from './write-result';
import { buttonPrimary, card, demoColors, input, mutedText } from '@/lib/demo/cafe/theme';

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
    <section style={card}>
      <h2 style={{ margin: 0, fontSize: 16 }}>レシピ・インストラクション管理</h2>
      <p style={{ margin: '8px 0 12px', ...mutedText }}>
        インストラクションに設定した項目は、スタッフ画面で先頭に表示されます。
      </p>
      {recipes === null ? (
        <p style={mutedText}>一覧を取得できません。</p>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {recipes.map((recipe) => (
            <div key={recipe.recipeId} style={{ display: 'grid', gridTemplateColumns: '1fr minmax(170px, auto)', gap: 10, alignItems: 'center' }}>
              <span>{recipe.titleJa || recipe.titleEn || recipe.recipeId}</span>
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
      {isPending ? <button type="button" style={{ ...buttonPrimary, marginTop: 10 }} disabled>保存中…</button> : null}
    </section>
  );
}
