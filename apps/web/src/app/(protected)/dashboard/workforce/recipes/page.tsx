import type { ReactNode } from 'react';
import { requireTenantContext } from '@/lib/tenant/context';
import { createClient } from '@/lib/supabase/server';
import { listTenantModules } from '@/lib/tenant/modules';
import { listWorkforceRecipeCategories } from '@/lib/workforce/recipe-categories';
import { groupRecipesByCategory, listWorkforceRecipes } from '@/lib/workforce/recipes';
import Link from 'next/link';
import {
  ErrorState,
  MissingConfigState,
  ModuleUnavailableState,
  NoTenantState,
  UnauthorizedState,
} from '@/components/states';
import { badgeStyle, card, linkAccent, mutedText, pageStyle } from '@/lib/ui/theme';

// Authenticated, session-dependent page: render per request, never prerender.
export const dynamic = 'force-dynamic';

function EmptyStateText({ children }: { children: ReactNode }) {
  return <p style={{ margin: '12px 0 0', ...mutedText }}>{children}</p>;
}

/**
 * Recipe list, grouped by category. Reachable only when the tenant's
 * `workforce` module is enabled (app-level entitlement check, not the
 * security boundary -- see `dashboard/workforce/page.tsx`). Recipe views are
 * not queried at all when the module is disabled.
 */
export default async function WorkforceRecipesPage() {
  const result = await requireTenantContext();

  switch (result.status) {
    case 'success': {
      const { activeTenant } = result.data;
      const supabase = await createClient();
      const modulesResult = await listTenantModules(supabase);
      const workforceEnabled =
        modulesResult.status === 'success' &&
        modulesResult.data.some(
          (module) =>
            module.tenantId === activeTenant.tenantId &&
            module.module === 'workforce' &&
            module.isEnabled,
        );

      if (!workforceEnabled) return <ModuleUnavailableState />;

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
            <h1 style={{ margin: 0 }}>Recipes</h1>
            <p style={{ margin: '8px 0 0', ...mutedText }}>
              Published recipes for {activeTenant.tenantName}, grouped by category.
            </p>
            <Link
              href="/dashboard/workforce"
              style={{ ...linkAccent, display: 'inline-block', marginTop: 12, fontSize: 14, textDecoration: 'underline' }}
            >
              Back to Workforce
            </Link>
          </header>

          {groups === null ? (
            <section style={card}>
              <EmptyStateText>Recipes are temporarily unavailable.</EmptyStateText>
            </section>
          ) : groups.every((group) => group.recipes.length === 0) ? (
            <section style={card}>
              <EmptyStateText>No recipes available yet.</EmptyStateText>
            </section>
          ) : (
            groups.map((group) => (
              <section key={group.category?.categoryId ?? 'uncategorized'} style={card}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h2 style={{ margin: 0, fontSize: 16 }}>
                    {group.category ? group.category.labelJa || group.category.labelEn : 'Uncategorized'}
                  </h2>
                  {group.recipes.length > 0 ? (
                    <span style={badgeStyle('neutral')}>{group.recipes.length}</span>
                  ) : null}
                </div>
                {group.recipes.length === 0 ? (
                  <EmptyStateText>No recipes in this category yet.</EmptyStateText>
                ) : (
                  <ul style={{ margin: '12px 0 0', padding: 0, listStyle: 'none' }}>
                    {group.recipes.map((recipe) => (
                      <li
                        key={recipe.recipeId}
                        style={{ marginTop: 4, borderRadius: 6, padding: '6px 8px', marginLeft: -8, marginRight: -8 }}
                      >
                        <Link
                          href={`/dashboard/workforce/recipes/${recipe.recipeId}`}
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
    case 'no_membership':
      return <NoTenantState />;
    case 'unauthorized':
      return <UnauthorizedState />;
    case 'config_error':
      return <MissingConfigState />;
    case 'unexpected_error':
      return <ErrorState />;
    // `not_authenticated` is already redirected to sign-in by requireTenantContext.
    default:
      return <ErrorState />;
  }
}
