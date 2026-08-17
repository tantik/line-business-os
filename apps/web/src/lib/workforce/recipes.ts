import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import type { TenantAccessResult } from '@/lib/tenant/types';
import type { WorkforceWriteResult } from './result-types';
import { mapWorkforceWriteError } from './pg-error';
import type { WorkforceRecipeCategory } from './recipe-categories';
import type { UpsertRecipeInput } from './recipe-input';

/** Flat row shape returned by `api.workforce_recipes`. */
interface ApiWorkforceRecipeRow {
  recipe_id: string;
  tenant_id: string;
  location_id: string | null;
  recipe_category_id: string | null;
  title_ja: string | null;
  title_en: string | null;
  description_ja: string | null;
  description_en: string | null;
  content_kind: 'recipe' | 'instruction';
  is_popular: boolean;
  status: string;
  created_at: string;
  updated_at: string;
  media_path: string | null;
  original_language: 'ja' | 'en';
}

export interface WorkforceRecipe {
  recipeId: string;
  tenantId: string;
  locationId: string | null;
  recipeCategoryId: string | null;
  titleJa: string | null;
  titleEn: string | null;
  descriptionJa: string | null;
  descriptionEn: string | null;
  contentKind: 'recipe' | 'instruction';
  isPopular: boolean;
  status: string;
  createdAt: string;
  updatedAt: string;
  mediaPath?: string | null;
  /** The language this recipe's human-authored content was written in. Translation always flows from this language to the other one -- a single recipe-level setting, never guessed per field. */
  originalLanguage: 'ja' | 'en';
}

/** Flat row shape returned by `api.workforce_recipe_ingredients`. */
interface ApiWorkforceRecipeIngredientRow {
  ingredient_id: string;
  tenant_id: string;
  recipe_id: string;
  label_ja: string | null;
  label_en: string | null;
  sort_order: number;
}

export interface WorkforceRecipeIngredient {
  ingredientId: string;
  tenantId: string;
  recipeId: string;
  labelJa: string | null;
  labelEn: string | null;
  sortOrder: number;
}

/** Flat row shape returned by `api.workforce_recipe_steps`. */
interface ApiWorkforceRecipeStepRow {
  step_id: string;
  tenant_id: string;
  recipe_id: string;
  step_number: number;
  instruction_ja: string | null;
  instruction_en: string | null;
}

export interface WorkforceRecipeStep {
  stepId: string;
  tenantId: string;
  recipeId: string;
  stepNumber: number;
  instructionJa: string | null;
  instructionEn: string | null;
}

/** Flat row shape returned by `api.workforce_recipe_notes`. */
interface ApiWorkforceRecipeNoteRow {
  note_id: string;
  tenant_id: string;
  recipe_id: string;
  title_ja: string | null;
  title_en: string | null;
  body_ja: string | null;
  body_en: string | null;
}

export interface WorkforceRecipeNote {
  noteId: string;
  tenantId: string;
  recipeId: string;
  titleJa: string | null;
  titleEn: string | null;
  bodyJa: string | null;
  bodyEn: string | null;
}

export interface WorkforceRecipeDetail {
  recipe: WorkforceRecipe;
  ingredients: WorkforceRecipeIngredient[];
  steps: WorkforceRecipeStep[];
  notes: WorkforceRecipeNote[];
}

export interface WorkforceRecipeGroup {
  category: WorkforceRecipeCategory | null;
  recipes: WorkforceRecipe[];
}

const RECIPE_SELECT =
  'recipe_id, tenant_id, location_id, recipe_category_id, title_ja, title_en, description_ja, description_en, content_kind, is_popular, status, created_at, updated_at, media_path, original_language';
const INGREDIENT_SELECT = 'ingredient_id, tenant_id, recipe_id, label_ja, label_en, sort_order';
const STEP_SELECT = 'step_id, tenant_id, recipe_id, step_number, instruction_ja, instruction_en';
const NOTE_SELECT = 'note_id, tenant_id, recipe_id, title_ja, title_en, body_ja, body_en';

function mapPostgrestError(error: PostgrestError): TenantAccessResult<never> {
  // 42501 = insufficient_privilege; PostgREST also surfaces "permission denied".
  if (error.code === '42501' || /permission denied/i.test(error.message)) {
    return { status: 'unauthorized', message: 'Not permitted to read workforce recipes.' };
  }
  return { status: 'unexpected_error', message: error.message };
}

function mapRecipeRow(row: ApiWorkforceRecipeRow): WorkforceRecipe {
  return {
    recipeId: row.recipe_id,
    tenantId: row.tenant_id,
    locationId: row.location_id,
    recipeCategoryId: row.recipe_category_id,
    titleJa: row.title_ja,
    titleEn: row.title_en,
    descriptionJa: row.description_ja,
    descriptionEn: row.description_en,
    contentKind: row.content_kind,
    isPopular: row.is_popular,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    mediaPath: row.media_path,
    originalLanguage: row.original_language,
  };
}

export async function upsertWorkforceRecipe(
  supabase: SupabaseClient,
  tenantId: string,
  locationId: string,
  input: UpsertRecipeInput,
): Promise<WorkforceWriteResult<{ recipeId: string }>> {
  try {
    const { data, error } = await supabase.schema('api').rpc('upsert_workforce_recipe', {
      p_tenant_id: tenantId, p_location_id: locationId, p_recipe_id: input.recipeId,
      p_content_kind: input.contentKind, p_title: input.title,
      p_description: input.description ?? '', p_status: input.status,
      p_ingredients: input.ingredients, p_steps: input.steps,
      p_note_title: input.noteTitle ?? '', p_note_body: input.noteBody ?? '', p_media_path: input.mediaPath,
      p_original_language: input.originalLanguage, p_confirm_language_change: input.confirmLanguageChange ?? false,
    });
    if (error) {
      if (error.message?.includes('recipe_language_change_requires_confirmation')) {
        return { status: 'language_change_requires_confirmation' };
      }
      return mapWorkforceWriteError(error, 'save this recipe');
    }
    return { status: 'success', data: { recipeId: String(data) } };
  } catch (err) {
    return { status: 'unexpected_error', message: err instanceof Error ? err.message : 'Unexpected error saving recipe.' };
  }
}

/**
 * Server-side gate for recipe management UI affordances (Add/Edit/Archive/
 * Delete). Recipes are tenant-wide, not location-scoped (unlike Staff/
 * schedule management, see `hasManagerAccess`), so this calls
 * `api.has_permission_in_tenant` (0066) rather than `api.has_permission` --
 * passing `null` as the latter's location would only match a tenant-wide
 * role assignment, never a location-scoped Manager. A pre-check, not a
 * substitute for RLS (`wf_recipes_*` policies, 0022, gate on the same
 * `workforce.recipe.manage` permission regardless of this result). Any RPC
 * error fails closed to `false`, never `true`.
 */
export async function hasRecipeManagerAccess(supabase: SupabaseClient, tenantId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.schema('api').rpc('has_permission_in_tenant', {
      p_tenant_id: tenantId,
      p_permission: 'workforce.recipe.manage',
    });
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
}

function compareRecipes(a: WorkforceRecipe, b: WorkforceRecipe): number {
  const kindPriority = Number(b.contentKind === 'instruction') - Number(a.contentKind === 'instruction');
  if (kindPriority !== 0) return kindPriority;
  const popularPriority = Number(b.isPopular) - Number(a.isPopular);
  if (popularPriority !== 0) return popularPriority;
  return (a.titleJa ?? a.titleEn ?? '').localeCompare(b.titleJa ?? b.titleEn ?? '') || a.recipeId.localeCompare(b.recipeId);
}

/**
 * Read workforce recipes through the app-facing API facade, narrowed to the
 * active tenant.
 *
 * `api.workforce_recipes` has no additional WHERE beyond RLS
 * (`wf_recipes_select_published` / `wf_recipes_select_manage`); the
 * `tenant_id` filter here is a display narrowing only, not the security
 * boundary.
 */
export async function listWorkforceRecipes(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<TenantAccessResult<WorkforceRecipe[]>> {
  try {
    const { data, error } = await supabase
      .schema('api')
      .from('workforce_recipes')
      .select(RECIPE_SELECT)
      .eq('tenant_id', tenantId);

    if (error) return mapPostgrestError(error);

    const rows = (data ?? []) as ApiWorkforceRecipeRow[];
    const recipes = rows.map(mapRecipeRow);
    recipes.sort(compareRecipes);
    return { status: 'success', data: recipes };
  } catch (err) {
    return {
      status: 'unexpected_error',
      message: err instanceof Error ? err.message : 'Unexpected error reading workforce recipes.',
    };
  }
}

/**
 * Batch-sign the storage media path for every recipe that has one, keyed by
 * `recipeId`. Shared by the Manager page's initial server-rendered load and
 * the `previewListRecipeMediaUrls` Server Action so both go through the same
 * one-call-per-list signing logic instead of duplicating it.
 */
export async function createRecipeMediaUrlMap(
  supabase: SupabaseClient,
  recipes: WorkforceRecipe[],
): Promise<Record<string, string>> {
  const media = recipes.filter((recipe) => recipe.mediaPath);
  if (media.length === 0) return {};
  const recipeIdByPath = new Map(media.map((recipe) => [recipe.mediaPath as string, recipe.recipeId]));
  const signed = await supabase.storage
    .from('recipe-media')
    .createSignedUrls(media.map((recipe) => recipe.mediaPath as string), 3600);
  if (signed.error) return {};
  return Object.fromEntries(signed.data.flatMap((entry) => {
    if (!entry.path || !entry.signedUrl) return [];
    const recipeId = recipeIdByPath.get(entry.path);
    return recipeId ? [[recipeId, entry.signedUrl]] : [];
  }));
}

export async function updateWorkforceRecipeContentKind(
  supabase: SupabaseClient,
  tenantId: string,
  recipeId: string,
  contentKind: 'recipe' | 'instruction',
): Promise<WorkforceWriteResult<WorkforceRecipe>> {
  try {
    const { data, error } = await supabase
      .schema('api')
      .from('workforce_recipes')
      .update({ content_kind: contentKind })
      .eq('tenant_id', tenantId)
      .eq('recipe_id', recipeId)
      .select(RECIPE_SELECT)
      .maybeSingle();
    if (error) return mapWorkforceWriteError(error, 'classify this recipe');
    if (!data) return { status: 'not_found' };
    return { status: 'success', data: mapRecipeRow(data as ApiWorkforceRecipeRow) };
  } catch (err) {
    return {
      status: 'unexpected_error',
      message: err instanceof Error ? err.message : 'Unexpected error classifying this recipe.',
    };
  }
}

export async function setWorkforceRecipeArchived(
  supabase: SupabaseClient,
  tenantId: string,
  recipeId: string,
  archived: boolean,
): Promise<WorkforceWriteResult<WorkforceRecipe>> {
  try {
    const { data, error } = await supabase
      .schema('api')
      .from('workforce_recipes')
      .update({ status: archived ? 'archived' : 'draft' })
      .eq('tenant_id', tenantId)
      .eq('recipe_id', recipeId)
      .select(RECIPE_SELECT)
      .maybeSingle();
    if (error) return mapWorkforceWriteError(error, archived ? 'archive this recipe' : 'restore this recipe');
    if (!data) return { status: 'not_found' };
    return { status: 'success', data: mapRecipeRow(data as ApiWorkforceRecipeRow) };
  } catch (err) {
    return { status: 'unexpected_error', message: err instanceof Error ? err.message : 'Unexpected error changing recipe status.' };
  }
}

/** Flat row shape returned by `api.permanently_delete_recipe` (0057). */
interface ApiPermanentDeleteRecipeRow {
  deleted: boolean;
  blocked_not_archived: boolean;
  media_path: string | null;
}

/**
 * Hard-delete a recipe (and its ingredients/steps/notes, cascaded by 0021's
 * FKs, plus every `content.translations` row keyed to any of them -- 0057's
 * own explicit cleanup, since that table deliberately has no FK) -- calls
 * `api.permanently_delete_recipe` (0057), never a raw DELETE. Only succeeds
 * when the recipe is currently `archived`; refused otherwise
 * (`blocked_not_archived`). Distinct from `setWorkforceRecipeArchived`, which
 * remains the normal, always-available, reversible Archive/Restore path and
 * never touches this RPC. On success, returns the recipe's `mediaPath` (if
 * any) so the caller can remove the Storage object -- this function has no
 * Storage access itself.
 */
export async function permanentlyDeleteRecipe(
  supabase: SupabaseClient,
  tenantId: string,
  recipeId: string,
): Promise<WorkforceWriteResult<{ recipeId: string; mediaPath: string | null }>> {
  try {
    const { data, error } = await supabase
      .schema('api')
      .rpc('permanently_delete_recipe', { p_tenant_id: tenantId, p_recipe_id: recipeId });

    if (error) return mapWorkforceWriteError(error, 'permanently delete this recipe');

    const row = (Array.isArray(data) ? data[0] : data) as ApiPermanentDeleteRecipeRow | undefined;
    if (!row) return { status: 'not_found' };
    if (row.blocked_not_archived) return { status: 'blocked_not_archived' };
    if (!row.deleted) return { status: 'unexpected_error', message: 'Unable to permanently delete this recipe right now.' };
    return { status: 'success', data: { recipeId, mediaPath: row.media_path } };
  } catch (err) {
    return {
      status: 'unexpected_error',
      message: err instanceof Error ? err.message : 'Unexpected error permanently deleting this recipe.',
    };
  }
}

/**
 * Read a single recipe plus its ingredients, steps, and notes through the
 * app-facing API facade, narrowed to the active tenant and requested recipe.
 *
 * `data: null` means the recipe id does not exist, belongs to another
 * tenant, or is filtered out by RLS -- these are indistinguishable at the
 * query layer (RLS filters rows, it does not reject the request), so this is
 * reported as `success` with no data, never as an error. Ingredients/steps/
 * notes are only queried once a visible recipe row is confirmed.
 */
export async function getWorkforceRecipeDetail(
  supabase: SupabaseClient,
  tenantId: string,
  recipeId: string,
): Promise<TenantAccessResult<WorkforceRecipeDetail | null>> {
  try {
    const { data: recipeRow, error: recipeError } = await supabase
      .schema('api')
      .from('workforce_recipes')
      .select(RECIPE_SELECT)
      .eq('tenant_id', tenantId)
      .eq('recipe_id', recipeId)
      .maybeSingle();

    if (recipeError) return mapPostgrestError(recipeError);
    if (!recipeRow) return { status: 'success', data: null };

    const [ingredientsResult, stepsResult, notesResult] = await Promise.all([
      supabase
        .schema('api')
        .from('workforce_recipe_ingredients')
        .select(INGREDIENT_SELECT)
        .eq('tenant_id', tenantId)
        .eq('recipe_id', recipeId),
      supabase
        .schema('api')
        .from('workforce_recipe_steps')
        .select(STEP_SELECT)
        .eq('tenant_id', tenantId)
        .eq('recipe_id', recipeId),
      supabase
        .schema('api')
        .from('workforce_recipe_notes')
        .select(NOTE_SELECT)
        .eq('tenant_id', tenantId)
        .eq('recipe_id', recipeId),
    ]);

    if (ingredientsResult.error) return mapPostgrestError(ingredientsResult.error);
    if (stepsResult.error) return mapPostgrestError(stepsResult.error);
    if (notesResult.error) return mapPostgrestError(notesResult.error);

    const ingredients = ((ingredientsResult.data ?? []) as ApiWorkforceRecipeIngredientRow[])
      .map((row) => ({
        ingredientId: row.ingredient_id,
        tenantId: row.tenant_id,
        recipeId: row.recipe_id,
        labelJa: row.label_ja,
        labelEn: row.label_en,
        sortOrder: row.sort_order,
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.ingredientId.localeCompare(b.ingredientId));

    const steps = ((stepsResult.data ?? []) as ApiWorkforceRecipeStepRow[])
      .map((row) => ({
        stepId: row.step_id,
        tenantId: row.tenant_id,
        recipeId: row.recipe_id,
        stepNumber: row.step_number,
        instructionJa: row.instruction_ja,
        instructionEn: row.instruction_en,
      }))
      .sort((a, b) => a.stepNumber - b.stepNumber || a.stepId.localeCompare(b.stepId));

    // Notes have no inherent order column; sort deterministically by title
    // then id rather than relying on undefined database/PostgREST ordering.
    const notes = ((notesResult.data ?? []) as ApiWorkforceRecipeNoteRow[])
      .map((row) => ({
        noteId: row.note_id,
        tenantId: row.tenant_id,
        recipeId: row.recipe_id,
        titleJa: row.title_ja,
        titleEn: row.title_en,
        bodyJa: row.body_ja,
        bodyEn: row.body_en,
      }))
      .sort((a, b) => (a.titleJa ?? '').localeCompare(b.titleJa ?? '') || a.noteId.localeCompare(b.noteId));

    return {
      status: 'success',
      data: {
        recipe: mapRecipeRow(recipeRow as ApiWorkforceRecipeRow),
        ingredients,
        steps,
        notes,
      },
    };
  } catch (err) {
    return {
      status: 'unexpected_error',
      message: err instanceof Error ? err.message : 'Unexpected error reading workforce recipe detail.',
    };
  }
}

/**
 * Group recipes by category. A category containing an instruction is promoted
 * so operational guidance is visible before ordinary recipe categories;
 * remaining groups retain category `sortOrder`. Recipes with no
 * category or whose category is not in the (RLS-filtered) `categories` list
 * are collected into one trailing `{ category: null, ... }` bucket, included
 * only when non-empty. Categories with zero matching recipes are still
 * included -- an empty category is a valid state, not hidden.
 */
export function groupRecipesByCategory(
  categories: WorkforceRecipeCategory[],
  recipes: WorkforceRecipe[],
): WorkforceRecipeGroup[] {
  const byCategory = new Map<string, WorkforceRecipe[]>();
  const uncategorized: WorkforceRecipe[] = [];

  for (const recipe of recipes) {
    const matchesKnownCategory =
      recipe.recipeCategoryId !== null &&
      categories.some((category) => category.categoryId === recipe.recipeCategoryId);

    if (matchesKnownCategory) {
      const categoryId = recipe.recipeCategoryId as string;
      const list = byCategory.get(categoryId) ?? [];
      list.push(recipe);
      byCategory.set(categoryId, list);
    } else {
      uncategorized.push(recipe);
    }
  }

  const groups: WorkforceRecipeGroup[] = categories.map((category) => ({
    category,
    recipes: byCategory.get(category.categoryId) ?? [],
  }));

  if (uncategorized.length > 0) {
    groups.push({ category: null, recipes: uncategorized });
  }

  return groups
    .map((group, index) => ({ group, index }))
    .sort((a, b) => {
      const instructionPriority =
        Number(b.group.recipes.some((recipe) => recipe.contentKind === 'instruction')) -
        Number(a.group.recipes.some((recipe) => recipe.contentKind === 'instruction'));
      return instructionPriority || a.index - b.index;
    })
    .map(({ group }) => group);
}
