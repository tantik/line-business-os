import { createClient } from '@/lib/supabase/server';
import { requirePreviewUser } from '@/lib/preview/auth';
import { resolvePreviewTenantContext } from '@/lib/preview/tenant';
import { resolvePreviewWorkforceModule } from '@/lib/preview/module-guard';
import { getWorkforceRecipeDetail } from '@/lib/workforce/recipes';
import { listContentTranslationsForEntities } from '@/lib/content/translations';
import { buildRecipeTranslationWorkspace, flattenRecipeTranslationFields } from '@/lib/content/recipe-translation-workspace';
import {
  PreviewErrorState,
  PreviewModuleUnavailableState,
  PreviewNoAccessState,
  PreviewNotFoundState,
} from '@/lib/preview/states';
import { PREVIEW_BASE_PATH } from '@/lib/preview/constants';
import { PreviewRecipeDetailView } from '@/lib/preview/preview-recipe-detail-view';

// Authenticated, session-dependent page: render per request, never prerender.
export const dynamic = 'force-dynamic';

/**
 * Mame To Cha preview recipe detail (Phase 1N-4C Slice B1) - read-only, same
 * data loader as the dashboard recipe detail page. A recipe id that does not
 * exist, belongs to another tenant, or is filtered out by RLS all render the
 * same neutral not-found state (indistinguishable at the query layer).
 */
export default async function MameToChaPreviewRecipeDetailPage({
  params,
}: {
  params: Promise<{ recipeId: string }>;
}) {
  const { recipeId } = await params;
  await requirePreviewUser(`${PREVIEW_BASE_PATH}/recipes/${recipeId}`);

  const tenantResult = await resolvePreviewTenantContext();
  if (tenantResult.status !== 'success') return <PreviewNoAccessState variant="light" />;

  const { activeTenant } = tenantResult.data;
  const supabase = await createClient();

  const moduleResult = await resolvePreviewWorkforceModule(supabase, activeTenant.tenantId);
  if (moduleResult.status === 'disabled') return <PreviewModuleUnavailableState variant="light" />;
  if (moduleResult.status !== 'enabled') return <PreviewErrorState variant="light" />;

  const detailResult = await getWorkforceRecipeDetail(supabase, activeTenant.tenantId, recipeId);
  if (detailResult.status !== 'success') return <PreviewErrorState variant="light" />;
  if (detailResult.data === null) return <PreviewNotFoundState variant="light" />;

  const fieldsForLookup = flattenRecipeTranslationFields(buildRecipeTranslationWorkspace(detailResult.data, []));
  const translationsResult = await listContentTranslationsForEntities(
    supabase,
    activeTenant.tenantId,
    fieldsForLookup.map((f) => ({ sourceEntityType: f.sourceEntityType, sourceEntityId: f.sourceEntityId })),
  );
  const translations = translationsResult.status === 'success' ? translationsResult.data : [];
  const workspace = buildRecipeTranslationWorkspace(detailResult.data, translations);

  return (
    <PreviewRecipeDetailView
      detail={detailResult.data}
      workspace={workspace}
      recipesListPath={`${PREVIEW_BASE_PATH}/recipes`}
    />
  );
}
