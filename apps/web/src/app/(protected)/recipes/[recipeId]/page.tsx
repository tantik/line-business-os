import type { Metadata } from 'next';
import { requireTenantContext } from '@/lib/tenant/context';
import { createClient } from '@/lib/supabase/server';
import { listTenantModules } from '@/lib/tenant/modules';
import { createRecipeMediaUrlMap, getWorkforceRecipeDetail, hasRecipeManagerAccess } from '@/lib/workforce/recipes';
import { listContentTranslationsForEntities } from '@/lib/content/translations';
import { buildRecipeTranslationWorkspace, flattenRecipeTranslationFields } from '@/lib/content/recipe-translation-workspace';
import {
  ErrorState,
  MissingConfigState,
  ModuleUnavailableState,
  NoTenantState,
  NotFoundState,
  UnauthorizedState,
} from '@/components/states';
import { RecipeDetailClient } from './recipe-detail-client';

// Authenticated, session-dependent page: render per request, never prerender.
export const dynamic = 'force-dynamic';

// Static, not per-recipe: a dynamic title would need its own `generateMetadata`
// data fetch, duplicating the page body's `getWorkforceRecipeDetail` call
// (frontend-engineering-standards.md §2 -- no duplicate fetches per request).
export const metadata: Metadata = { title: 'Recipe', robots: { index: false, follow: false } };

/**
 * Recipe detail (ingredients, steps, notes). Reachable only when the
 * tenant's `workforce` module is enabled (app-level entitlement check, not
 * the security boundary -- see `dashboard/workforce/page.tsx`). Recipe
 * views are not queried at all when the module is disabled. A recipe id
 * that does not exist, belongs to another tenant, or is filtered out by RLS
 * all render the same neutral `NotFoundState` -- these are indistinguishable
 * at the query layer.
 */
export default async function WorkforceRecipeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ recipeId: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const { recipeId } = await params;
  const { edit } = await searchParams;
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

      const [detailResult, canManage] = await Promise.all([
        getWorkforceRecipeDetail(supabase, activeTenant.tenantId, recipeId),
        hasRecipeManagerAccess(supabase, activeTenant.tenantId),
      ]);

      if (detailResult.status === 'unauthorized') return <UnauthorizedState />;
      if (detailResult.status !== 'success') return <ErrorState />;
      if (detailResult.data === null) return <NotFoundState />;

      const { recipe, ingredients, steps, notes } = detailResult.data;

      // Every field this recipe can carry a translation for, in one query --
      // `content_translations` rows for the recipe itself plus each
      // ingredient/step/note. Feeds `resolveFieldDisplay` client-side so an
      // EN viewer actually sees the saved English translation instead of the
      // JA source (Cafe v2.1 QA audit P1-3, 2026-08-17: previously nothing
      // read this table at all, so switching to EN only translated page
      // chrome, never recipe content).
      const translationsResult = await listContentTranslationsForEntities(supabase, activeTenant.tenantId, [
        { sourceEntityType: 'workforce_recipe', sourceEntityId: recipe.recipeId },
        ...ingredients.map((i) => ({ sourceEntityType: 'workforce_recipe_ingredient' as const, sourceEntityId: i.ingredientId })),
        ...steps.map((s) => ({ sourceEntityType: 'workforce_recipe_step' as const, sourceEntityId: s.stepId })),
        ...notes.map((n) => ({ sourceEntityType: 'workforce_recipe_note' as const, sourceEntityId: n.noteId })),
      ]);
      const translations = translationsResult.status === 'success' ? translationsResult.data : [];
      const translationFields = flattenRecipeTranslationFields(buildRecipeTranslationWorkspace({ recipe, ingredients, steps, notes }, translations));
      const mediaUrlMap = await createRecipeMediaUrlMap(supabase, [recipe]);

      return (
        <RecipeDetailClient
          recipe={recipe}
          ingredients={ingredients}
          steps={steps}
          notes={notes}
          translationFields={translationFields}
          canManage={canManage}
          mediaUrl={mediaUrlMap[recipe.recipeId] ?? null}
          initialEditing={edit === '1'}
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
