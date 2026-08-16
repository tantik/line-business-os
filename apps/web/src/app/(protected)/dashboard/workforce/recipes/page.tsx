import { requireTenantContext } from '@/lib/tenant/context';
import { createClient } from '@/lib/supabase/server';
import { listTenantModules } from '@/lib/tenant/modules';
import { listWorkforceRecipeCategories } from '@/lib/workforce/recipe-categories';
import { groupRecipesByCategory, listWorkforceRecipes } from '@/lib/workforce/recipes';
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

      return <RecipesListClient tenantName={activeTenant.tenantName} groups={groups} />;
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
