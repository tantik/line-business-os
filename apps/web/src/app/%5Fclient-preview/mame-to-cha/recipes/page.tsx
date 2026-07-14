import type { ReactNode } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { requirePreviewUser } from '@/lib/preview/auth';
import { resolvePreviewTenantContext } from '@/lib/preview/tenant';
import { resolvePreviewWorkforceModule } from '@/lib/preview/module-guard';
import { listWorkforceRecipeCategories } from '@/lib/workforce/recipe-categories';
import { groupRecipesByCategory, listWorkforceRecipes } from '@/lib/workforce/recipes';
import { PreviewErrorState, PreviewModuleUnavailableState, PreviewNoAccessState } from '@/lib/preview/states';
import { PREVIEW_BASE_PATH } from '@/lib/preview/constants';
import { badgeStyle, card, linkAccent, mutedText, pageStyle } from '@/lib/ui/theme';

// Authenticated, session-dependent page: render per request, never prerender.
export const dynamic = 'force-dynamic';

const RECIPES_PUBLIC_PATH = `${PREVIEW_BASE_PATH}/recipes`;

function EmptyStateText({ children }: { children: ReactNode }) {
  return <p style={{ margin: '12px 0 0', ...mutedText }}>{children}</p>;
}

/**
 * Mame To Cha preview recipe list (Phase 1N-4C Slice B1) - already read-only
 * upstream (no mutation actions exist for recipes), so this composes the
 * shared data loaders directly with preview-scoped links.
 */
export default async function MameToChaPreviewRecipesPage() {
  await requirePreviewUser(RECIPES_PUBLIC_PATH);

  const tenantResult = await resolvePreviewTenantContext();
  if (tenantResult.status !== 'success') return <PreviewNoAccessState />;

  const { activeTenant } = tenantResult.data;
  const supabase = await createClient();

  const moduleResult = await resolvePreviewWorkforceModule(supabase, activeTenant.tenantId);
  if (moduleResult.status === 'disabled') return <PreviewModuleUnavailableState />;
  if (moduleResult.status !== 'enabled') return <PreviewErrorState />;

  const [categoriesResult, recipesResult] = await Promise.all([
    listWorkforceRecipeCategories(supabase, activeTenant.tenantId),
    listWorkforceRecipes(supabase, activeTenant.tenantId),
  ]);

  const groups =
    categoriesResult.status === 'success' && recipesResult.status === 'success'
      ? groupRecipesByCategory(categoriesResult.data, recipesResult.data)
      : null;

  return (
    <main style={pageStyle(880)}>
      <header>
        <h1 style={{ margin: 0 }}>Mame To Cha プレビュー - レシピ</h1>
        <p style={{ margin: '8px 0 0', ...mutedText }}>{activeTenant.tenantName} の公開レシピ（カテゴリー別）</p>
        <Link
          href={PREVIEW_BASE_PATH}
          style={{ ...linkAccent, display: 'inline-block', marginTop: 12, fontSize: 14, textDecoration: 'underline' }}
        >
          プレビュートップへ戻る
        </Link>
      </header>

      {groups === null ? (
        <section style={card}>
          <EmptyStateText>レシピを一時的に取得できません。</EmptyStateText>
        </section>
      ) : groups.every((group) => group.recipes.length === 0) ? (
        <section style={card}>
          <EmptyStateText>まだレシピがありません。</EmptyStateText>
        </section>
      ) : (
        groups.map((group) => (
          <section key={group.category?.categoryId ?? 'uncategorized'} style={card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h2 style={{ margin: 0, fontSize: 16 }}>
                {group.category ? group.category.labelJa || group.category.labelEn : '未分類'}
              </h2>
              {group.recipes.length > 0 ? <span style={badgeStyle('neutral')}>{group.recipes.length}</span> : null}
            </div>
            {group.recipes.length === 0 ? (
              <EmptyStateText>このカテゴリーにレシピはまだありません。</EmptyStateText>
            ) : (
              <ul style={{ margin: '12px 0 0', padding: 0, listStyle: 'none' }}>
                {group.recipes.map((recipe) => (
                  <li
                    key={recipe.recipeId}
                    style={{ marginTop: 4, borderRadius: 6, padding: '6px 8px', marginLeft: -8, marginRight: -8 }}
                  >
                    <Link
                      href={`${PREVIEW_BASE_PATH}/recipes/${recipe.recipeId}`}
                      style={{ ...linkAccent, textDecoration: 'underline' }}
                    >
                      {recipe.titleJa || recipe.titleEn || recipe.recipeId}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))
      )}
    </main>
  );
}
