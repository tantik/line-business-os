'use client';

import Link from 'next/link';
import type { WorkforceRecipeGroup } from '@/lib/workforce/recipes';
import { LangProvider, useLang } from '@/lib/demo/cafe/i18n';
import { PreviewLanguageToggle } from '@/lib/preview/preview-language-toggle';
import { badgeStyle, card, linkAccent, mutedText, pageStyle } from '@/lib/ui/theme';
import { tRecipes } from './recipes-i18n';

export interface RecipesListClientProps {
  tenantName: string;
  groups: WorkforceRecipeGroup[] | null;
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

function RecipesListBody({ tenantName, groups }: RecipesListClientProps) {
  const { lang } = useLang();
  const t = (key: Parameters<typeof tRecipes>[1]) => tRecipes(lang, key);

  return (
    <>
      <header>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0 }}>{t('pageTitle')}</h1>
          <PreviewLanguageToggle />
        </div>
        <p style={{ margin: '8px 0 0', ...mutedText }}>
          {t('pageDescription')} {tenantName}.
        </p>
        <Link
          href="/dashboard/workforce"
          style={{ ...linkAccent, display: 'inline-block', marginTop: 12, fontSize: 14, textDecoration: 'underline' }}
        >
          {t('backToWorkforce')}
        </Link>
      </header>

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
                    <Link href={`/dashboard/workforce/recipes/${recipe.recipeId}`} style={{ ...linkAccent, textDecoration: 'underline' }}>
                      {recipe.titleJa || recipe.titleEn || recipe.recipeId}
                    </Link>
                    {recipe.contentKind === 'instruction' ? (
                      <span style={{ ...badgeStyle('neutral'), marginLeft: 8 }}>{t('instructionBadge')}</span>
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
