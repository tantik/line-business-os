import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/context';
import { createClient } from '@/lib/supabase/server';
import { listTenantModules } from '@/lib/tenant/modules';
import { listTenantLocations } from '@/lib/tenant/locations';
import { hasManagerAccess } from '@/lib/workforce/manager-access';
import { listWorkforceRecipeCategories } from '@/lib/workforce/recipe-categories';
import { createRecipeMediaUrlMap, groupRecipesByCategory, hasRecipeManagerAccess, listWorkforceRecipes } from '@/lib/workforce/recipes';
import { listContentTranslationsForField } from '@/lib/content/translations';
import { buildRecipeTranslationField, type RecipeTranslationField } from '@/lib/content/recipe-translation-workspace';
import {
  ErrorState,
  MissingConfigState,
  ModuleUnavailableState,
  NoTenantState,
  UnauthorizedState,
} from '@/components/states';
import { RecipesListClient } from './recipes-list-client';

// Authenticated, session-dependent page: render per request, never prerender.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Recipes', robots: { index: false, follow: false } };

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

      // Manager-role visitors (same hasManagerAccess gate as `/manager`
      // itself) are sent into the Manager dashboard's Recipes popup (WP
      // A5b) instead of this standalone page -- same reasoning as the
      // Inventory redirect (WP A5a): `/recipes` is shared by both Manager
      // and Staff, so Staff-role visitors must see this exact page
      // unchanged. If no single active location can be resolved, this
      // check is skipped entirely (fails open to "just show the page",
      // not "block access") -- recipes are tenant-wide, not
      // location-scoped, so a location-resolution hiccup here should never
      // stop a Manager from reaching their recipes at all.
      const locationsResult = await listTenantLocations(supabase);
      const activeTenantLocations =
        locationsResult.status === 'success' ? locationsResult.data.filter((l) => l.tenantId === activeTenant.tenantId && l.isActive) : [];
      if (activeTenantLocations.length === 1) {
        const managerAccess = await hasManagerAccess(supabase, activeTenant.tenantId, activeTenantLocations[0]!.locationId);
        if (managerAccess) redirect('/manager?popup=recipes');
      }

      const [categoriesResult, recipesResult, canManage] = await Promise.all([
        listWorkforceRecipeCategories(supabase, activeTenant.tenantId),
        listWorkforceRecipes(supabase, activeTenant.tenantId),
        hasRecipeManagerAccess(supabase, activeTenant.tenantId),
      ]);

      const groups =
        categoriesResult.status === 'success' && recipesResult.status === 'success'
          ? groupRecipesByCategory(categoriesResult.data, recipesResult.data)
          : null;

      // Title-only translation lookup for the list view (Cafe v2.1 QA audit
      // P1-3, 2026-08-17): bounded to one field across every recipe, rather
      // than loading each recipe's full ingredients/steps/notes just to show
      // a list row. Detail-page content translation is wired separately in
      // `[recipeId]/page.tsx`.
      const titleTranslationsResult =
        recipesResult.status === 'success'
          ? await listContentTranslationsForField(supabase, activeTenant.tenantId, 'workforce_recipe', 'title')
          : null;
      const titleTranslations = titleTranslationsResult?.status === 'success' ? titleTranslationsResult.data : [];
      const titleFieldByRecipeId: Record<string, RecipeTranslationField> =
        recipesResult.status === 'success'
          ? Object.fromEntries(
              recipesResult.data.map((recipe) => [
                recipe.recipeId,
                buildRecipeTranslationField(
                  'workforce_recipe',
                  recipe.recipeId,
                  'title',
                  recipe.originalLanguage,
                  (recipe.originalLanguage === 'ja' ? recipe.titleJa : recipe.titleEn) ?? '',
                  recipe.originalLanguage === 'ja' ? recipe.titleEn : recipe.titleJa,
                  titleTranslations,
                ),
              ]),
            )
          : {};
      const mediaUrlByRecipeId =
        recipesResult.status === 'success' ? await createRecipeMediaUrlMap(supabase, recipesResult.data) : {};

      return (
        <RecipesListClient
          tenantName={activeTenant.tenantName}
          groups={groups}
          titleFieldByRecipeId={titleFieldByRecipeId}
          mediaUrlByRecipeId={mediaUrlByRecipeId}
          canManage={canManage}
        />
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
