'use server';

import { createClient } from '@/lib/supabase/server';
import { requireTenantContext } from '@/lib/tenant/context';
import { listTenantLocations } from '@/lib/tenant/locations';
import {
  permanentlyDeleteRecipe as permanentlyDeleteRecipeWrite,
  setWorkforceRecipeArchived,
  upsertWorkforceRecipe,
  type WorkforceRecipe,
} from './recipes';
import { parseUpsertRecipeInput } from './recipe-input';
import type { WorkforceWriteResult } from './result-types';

/**
 * Server Actions for Manager recipe CRUD (Cafe v2.1 QA audit P1-2,
 * 2026-08-17: the backend for all of this -- `upsertWorkforceRecipe`,
 * `setWorkforceRecipeArchived`, `permanentlyDeleteRecipe` -- already existed
 * and was already tested; nothing in the canonical UI ever called it). Thin
 * controllers, same shape as `attendance-actions.ts`/`staff-actions.ts`:
 * authorization is `wf_recipes_*` RLS (`workforce.recipe.manage`,
 * `hasRecipeManagerAccess`'s pre-check), not re-derived here.
 */

const INVALID_INPUT_RESULT = { status: 'unexpected_error', message: 'Invalid input.' } as const;

/**
 * Recipes are tenant-wide content, not per-caller like a staff profile, so
 * there is no "my own recipe location" to resolve the way
 * `submitWorkReport` resolves the caller's staff profile location. Instead
 * this mirrors `/manager` page's own LOC-1 fail-closed rule (exactly one
 * active location) -- required because `upsert_workforce_recipe` (0060)
 * always takes a concrete `p_location_id`, tenant-wide recipes included
 * (its own header: "p_location_id is always the caller's own resolved
 * location"). A multi-location tenant needs a real location picker in the
 * form, out of scope for this MVP slice.
 */
async function resolveSoleActiveLocationId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
): Promise<WorkforceWriteResult<string>> {
  const locationsResult = await listTenantLocations(supabase);
  if (locationsResult.status !== 'success') return locationsResult;
  const activeLocations = locationsResult.data.filter((l) => l.tenantId === tenantId && l.isActive);
  if (activeLocations.length !== 1) {
    return { status: 'unexpected_error', message: 'This action requires exactly one active location; multi-location recipe management is not supported yet.' };
  }
  return { status: 'success', data: activeLocations[0]!.locationId };
}

export async function upsertRecipe(formData: FormData): Promise<WorkforceWriteResult<{ recipeId: string }>> {
  const input = parseUpsertRecipeInput(formData);
  if (!input) return INVALID_INPUT_RESULT;

  const tenantContext = await requireTenantContext();
  if (tenantContext.status !== 'success') return tenantContext;

  const supabase = await createClient();
  const tenantId = tenantContext.data.activeTenant.tenantId;

  const locationResult = await resolveSoleActiveLocationId(supabase, tenantId);
  if (locationResult.status !== 'success') return locationResult;

  return upsertWorkforceRecipe(supabase, tenantId, locationResult.data, input);
}

export async function setRecipeArchived(formData: FormData): Promise<WorkforceWriteResult<WorkforceRecipe>> {
  const recipeId = formData.get('recipeId');
  const archived = formData.get('archived');
  if (typeof recipeId !== 'string' || !recipeId.trim() || (archived !== 'true' && archived !== 'false')) {
    return INVALID_INPUT_RESULT;
  }

  const tenantContext = await requireTenantContext();
  if (tenantContext.status !== 'success') return tenantContext;

  const supabase = await createClient();
  return setWorkforceRecipeArchived(supabase, tenantContext.data.activeTenant.tenantId, recipeId, archived === 'true');
}

export async function permanentlyDeleteRecipe(
  formData: FormData,
): Promise<WorkforceWriteResult<{ recipeId: string; mediaPath: string | null }>> {
  const recipeId = formData.get('recipeId');
  if (typeof recipeId !== 'string' || !recipeId.trim()) return INVALID_INPUT_RESULT;

  const tenantContext = await requireTenantContext();
  if (tenantContext.status !== 'success') return tenantContext;

  const supabase = await createClient();
  return permanentlyDeleteRecipeWrite(supabase, tenantContext.data.activeTenant.tenantId, recipeId);
}
