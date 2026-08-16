import { requireTenantContext } from '@/lib/tenant/context';
import { createClient } from '@/lib/supabase/server';
import { listTenantModules } from '@/lib/tenant/modules';
import { getWorkforceRecipeDetail } from '@/lib/workforce/recipes';
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
}: {
  params: Promise<{ recipeId: string }>;
}) {
  const { recipeId } = await params;
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

      const detailResult = await getWorkforceRecipeDetail(supabase, activeTenant.tenantId, recipeId);

      if (detailResult.status === 'unauthorized') return <UnauthorizedState />;
      if (detailResult.status !== 'success') return <ErrorState />;
      if (detailResult.data === null) return <NotFoundState />;

      const { recipe, ingredients, steps, notes } = detailResult.data;

      return <RecipeDetailClient recipe={recipe} ingredients={ingredients} steps={steps} notes={notes} />;
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
