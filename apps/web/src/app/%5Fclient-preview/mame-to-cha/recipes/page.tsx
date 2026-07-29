import { RecipeBrowser } from '@/components/demo/cafe/views/RecipeView';
import { BrandProvider, MAME_TO_CHA_BRAND } from '@/lib/demo/brand';
import { createClient } from '@/lib/supabase/server';
import { requirePreviewUser } from '@/lib/preview/auth';
import { PREVIEW_BASE_PATH } from '@/lib/preview/constants';
import { resolvePreviewWorkforceModule } from '@/lib/preview/module-guard';
import { toPreviewRecipeViewModel } from '@/lib/preview/recipe-view-model';
import { PreviewErrorState, PreviewModuleUnavailableState, PreviewNoAccessState } from '@/lib/preview/states';
import { resolvePreviewTenantContext } from '@/lib/preview/tenant';
import { listWorkforceRecipeCategories } from '@/lib/workforce/recipe-categories';
import { getWorkforceRecipeDetail, listWorkforceRecipes } from '@/lib/workforce/recipes';
import { listContentTranslationsForEntities } from '@/lib/content/translations';
import { buildRecipeTranslationWorkspace, flattenRecipeTranslationFields } from '@/lib/content/recipe-translation-workspace';

export const dynamic = 'force-dynamic';

const RECIPES_PUBLIC_PATH = `${PREVIEW_BASE_PATH}/recipes`;

export default async function MameToChaPreviewRecipesPage() {
  await requirePreviewUser(RECIPES_PUBLIC_PATH);

  const tenantResult = await resolvePreviewTenantContext();
  if (tenantResult.status !== 'success') return <PreviewNoAccessState variant="light" />;

  const { activeTenant } = tenantResult.data;
  const supabase = await createClient();
  const moduleResult = await resolvePreviewWorkforceModule(supabase, activeTenant.tenantId);
  if (moduleResult.status === 'disabled') return <PreviewModuleUnavailableState variant="light" />;
  if (moduleResult.status !== 'enabled') return <PreviewErrorState variant="light" />;

  const [categoriesResult, recipesResult] = await Promise.all([
    listWorkforceRecipeCategories(supabase, activeTenant.tenantId),
    listWorkforceRecipes(supabase, activeTenant.tenantId),
  ]);
  if (categoriesResult.status !== 'success' || recipesResult.status !== 'success') return <PreviewErrorState variant="light" />;

  const detailResults = await Promise.all(
    recipesResult.data.map((recipe) => getWorkforceRecipeDetail(supabase, activeTenant.tenantId, recipe.recipeId)),
  );
  if (detailResults.some((result) => result.status !== 'success')) return <PreviewErrorState variant="light" />;

  // Staff EN rendering must prefer a current content.translations row over
  // the legacy *_en column (see recipe-display.ts) -- load each visible
  // recipe's translations alongside its detail, same "load everything
  // server-side before rendering" style as the rest of this preview shell.
  const recipes = await Promise.all(
    detailResults.map(async (result) => {
      if (result.status !== 'success' || !result.data) return null;
      const fieldsForLookup = flattenRecipeTranslationFields(buildRecipeTranslationWorkspace(result.data, []));
      const translationsResult = await listContentTranslationsForEntities(
        supabase,
        activeTenant.tenantId,
        fieldsForLookup.map((f) => ({ sourceEntityType: f.sourceEntityType, sourceEntityId: f.sourceEntityId })),
      );
      const translations = translationsResult.status === 'success' ? translationsResult.data : [];
      const workspace = buildRecipeTranslationWorkspace(result.data, translations);
      return toPreviewRecipeViewModel(result.data, categoriesResult.data, workspace);
    }),
  ).then((results) => results.filter((r): r is NonNullable<typeof r> => r !== null));

  return (
    <BrandProvider brand={MAME_TO_CHA_BRAND}>
      <RecipeBrowser recipes={recipes} />
    </BrandProvider>
  );
}
