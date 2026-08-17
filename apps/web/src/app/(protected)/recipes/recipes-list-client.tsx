'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { WorkforceRecipeGroup } from '@/lib/workforce/recipes';
import type { RecipeTranslationField } from '@/lib/content/recipe-translation-workspace';
import { resolveFieldDisplay } from '@/lib/content/recipe-display';
import { LangProvider, useLang } from '@/lib/demo/cafe/i18n';
import { PreviewLanguageToggle } from '@/lib/preview/preview-language-toggle';
import { SignOutButton } from '@/components/sign-out-button';
import { badgeStyle, buttonSecondary, card, linkAccent, mutedText, pageStyle } from '@/lib/ui/theme';
import { RecipeForm } from './recipe-form';
import { tRecipes } from './recipes-i18n';

export interface RecipesListClientProps {
  tenantName: string;
  groups: WorkforceRecipeGroup[] | null;
  /** Each recipe's title translation field, keyed by `recipeId` -- see `resolveFieldDisplay`. */
  titleFieldByRecipeId: Record<string, RecipeTranslationField>;
  /** Pure UX affordance (RLS is the real boundary regardless): whether to show the Add-recipe control. */
  canManage: boolean;
}

/**
 * Outer wrapper: mounts the shared `LangProvider` around the Recipes list
 * page body, matching the same pattern the canonical Staff dashboard,
 * Admin page, and Inventory page already use.
 */
export function RecipesListClient(props: RecipesListClientProps) {
  return (
    <LangProvider>
      <main style={pageStyle(880)}>
        <RecipesListBody {...props} />
      </main>
    </LangProvider>
  );
}

function RecipesListBody({ tenantName, groups, titleFieldByRecipeId, canManage }: RecipesListClientProps) {
  const { lang } = useLang();
  const router = useRouter();
  const t = (key: Parameters<typeof tRecipes>[1]) => tRecipes(lang, key);
  const [adding, setAdding] = useState(false);

  function recipeTitle(recipe: WorkforceRecipeGroup['recipes'][number]): string {
    const field = titleFieldByRecipeId[recipe.recipeId];
    if (!field) return recipe.titleJa || recipe.titleEn || recipe.recipeId;
    return resolveFieldDisplay(field, lang).text || recipe.recipeId;
  }

  return (
    <>
      <header>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0 }}>{t('pageTitle')}</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <PreviewLanguageToggle />
            <SignOutButton label={t('signOut')} />
          </div>
        </div>
        <p style={{ margin: '8px 0 0', ...mutedText }}>
          {t('pageDescription')} {tenantName}.
        </p>
        <Link
          href={canManage ? '/manager' : '/staff'}
          style={{ ...linkAccent, display: 'inline-block', marginTop: 12, fontSize: 14, textDecoration: 'underline' }}
        >
          {t('backToWorkforce')}
        </Link>
      </header>

      {canManage ? (
        <section style={card}>
          {adding ? (
            <>
              <h2 style={{ margin: 0, fontSize: 15 }}>{t('newRecipeHeading')}</h2>
              <RecipeForm
                lang={lang}
                onSuccess={() => {
                  setAdding(false);
                  router.refresh();
                }}
                onCancel={() => setAdding(false)}
              />
            </>
          ) : (
            <button type="button" style={buttonSecondary} onClick={() => setAdding(true)}>
              {t('addRecipeButton')}
            </button>
          )}
        </section>
      ) : null}

      {groups === null ? (
        <section style={card}>
          <p style={{ margin: '12px 0 0', ...mutedText }}>{t('unavailable')}</p>
        </section>
      ) : groups.every((group) => group.recipes.length === 0) ? (
        <section style={card}>
          <p style={{ margin: '12px 0 0', ...mutedText }}>{t('noRecipesYet')}</p>
        </section>
      ) : (
        groups.map((group) => (
          <section key={group.category?.categoryId ?? 'uncategorized'} style={card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h2 style={{ margin: 0, fontSize: 16 }}>
                {group.category ? group.category.labelJa || group.category.labelEn : t('uncategorized')}
              </h2>
              {group.recipes.length > 0 ? <span style={badgeStyle('neutral')}>{group.recipes.length}</span> : null}
            </div>
            {group.recipes.length === 0 ? (
              <p style={{ margin: '12px 0 0', ...mutedText }}>{t('noRecipesInCategory')}</p>
            ) : (
              <ul style={{ margin: '12px 0 0', padding: 0, listStyle: 'none' }}>
                {group.recipes.map((recipe) => (
                  <li key={recipe.recipeId} style={{ marginTop: 4, borderRadius: 6, padding: '6px 8px', marginLeft: -8, marginRight: -8 }}>
                    <Link href={`/recipes/${recipe.recipeId}`} style={{ ...linkAccent, textDecoration: 'underline' }}>
                      {recipeTitle(recipe)}
                    </Link>
                    {recipe.contentKind === 'instruction' ? (
                      <span style={{ ...badgeStyle('neutral'), marginLeft: 8 }}>{t('instructionBadge')}</span>
                    ) : null}
                    {recipe.status === 'draft' ? (
                      <span style={{ ...badgeStyle('neutral'), marginLeft: 8 }}>{t('draftBadge')}</span>
                    ) : recipe.status === 'archived' ? (
                      <span style={{ ...badgeStyle('neutral'), marginLeft: 8 }}>{t('archivedBadge')}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))
      )}
    </>
  );
}
