import { RecipeBrowser } from '@/components/demo/cafe/views/RecipeView';
import { BrandProvider, MAME_TO_CHA_BRAND } from '@/lib/demo/brand';
import { LangProvider } from '@/lib/demo/cafe/i18n';
import { createClient } from '@/lib/supabase/server';
import { requirePreviewUser } from '@/lib/preview/auth';
import { PREVIEW_BASE_PATH } from '@/lib/preview/constants';
import { resolvePreviewWorkforceModule } from '@/lib/preview/module-guard';
import { toPreviewRecipeViewModel } from '@/lib/preview/recipe-view-model';
import { PreviewErrorState, PreviewModuleUnavailableState, PreviewNoAccessState } from '@/lib/preview/states';
import { resolvePreviewTenantContext } from '@/lib/preview/tenant';
import { listWorkforceRecipeCategories } from '@/lib/workforce/recipe-categories';
import { getWorkforceRecipeDetail, listWorkforceRecipes } from '@/lib/workforce/recipes';

export const dynamic = 'force-dynamic';

const RECIPES_PUBLIC_PATH = `${PREVIEW_BASE_PATH}/recipes`;

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
  if (categoriesResult.status !== 'success' || recipesResult.status !== 'success') return <PreviewErrorState />;

  const detailResults = await Promise.all(
    recipesResult.data.map((recipe) => getWorkforceRecipeDetail(supabase, activeTenant.tenantId, recipe.recipeId)),
  );
  if (detailResults.some((result) => result.status !== 'success')) return <PreviewErrorState />;

  const recipes = detailResults.flatMap((result) =>
    result.status === 'success' && result.data
      ? [toPreviewRecipeViewModel(result.data, categoriesResult.data)]
      : [],
  );

  return (
    <BrandProvider brand={MAME_TO_CHA_BRAND}>
      <LangProvider>
        <RecipeBrowser recipes={recipes} />
      </LangProvider>
    </BrandProvider>
  );
}
