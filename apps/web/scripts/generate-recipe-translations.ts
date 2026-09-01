/**
 * One-time/repeatable admin script: generate machine translations for every
 * existing recipe of one tenant, using the exact same application code path
 * as the Manager "Generate Translation" action (`previewGenerateRecipeTranslation`
 * in `src/lib/preview/actions/recipe-translation-actions.ts`) -- just driven
 * recipe-by-recipe from a script instead of one recipe per HTTP request.
 *
 * Every piece of business logic below is the SAME imported module the real
 * Server Action calls -- nothing here is reimplemented or duplicated:
 *   - listWorkforceRecipes / getWorkforceRecipeDetail   (src/lib/workforce/recipes.ts)
 *   - buildRecipeTranslationWorkspace / flattenRecipeTranslationFields
 *     (src/lib/content/recipe-translation-workspace.ts)
 *   - listContentTranslationsForEntities / setMachineContentTranslation
 *     (src/lib/content/translations.ts) -- the ONLY write path used; it calls
 *     the `api.set_machine_content_translation_confirmed` RPC, never a raw
 *     table write.
 *   - resolveContentTranslationProvider (src/lib/content/translation-provider-factory.ts)
 *   - runContentTranslationBatch        (src/lib/content/translation-orchestrator.ts)
 *
 * The only thing this script does NOT reuse is the Next.js request-bound
 * glue (`resolvePreviewManagerContext`, `resolvePreviewTenantContext`) --
 * those call `next/headers` cookies() and `next/navigation` redirect(),
 * which only exist inside a real Next.js request and cannot run in a plain
 * script. In their place, this script calls the exact same underlying,
 * non-Next-bound primitives those wrappers call (`listTenantMemberships`,
 * `selectPreviewMembership`, `resolvePreviewWorkforceModule`,
 * `listTenantLocations`, `resolveManagerLocation`, the `api.has_permission`
 * RPC) in the same order, against a real authenticated session -- so the
 * same RLS policies and the same permission check evaluate the same way.
 *
 * SECURITY / SCOPE
 * - Authenticates as a REAL manager user via Supabase Auth password sign-in
 *   (low-privilege key only: publishable-preferred, legacy anon fallback) --
 *   never a service-role / secret key. Every read/write below runs
 *   under that user's session, so RLS is the enforcing boundary throughout,
 *   exactly as it is for the real app.
 * - Never writes to `content.translations` directly -- only ever through
 *   `setMachineContentTranslation`'s RPC call.
 * - Never touches a `reviewed` translation unless RECIPE_TRANSLATION_REPLACE_STALE_REVIEWED=true
 *   is explicitly set (default false), matching the orchestrator's own
 *   "reviewed is untouchable except by explicit force" rule.
 * - Never logs recipe/translation text, credentials, or API keys -- only
 *   counts and field references (entity type + field name).
 * - Reusable for any tenant: set RECIPE_TRANSLATION_TENANT_SLUG to override
 *   the default ('mame-to-cha').
 *
 * DRY RUN + CONFIRMATION
 * Before any write, the script loads every recipe's fields once and runs the
 * REAL orchestrator (`runContentTranslationBatch`) against a local no-op
 * "echo" provider (zero network calls, zero cost) to compute exactly which
 * fields would be translated and how many would be skipped and why -- the
 * same skip rules, because it is the same orchestrator call. It then prints
 * a summary (tenant, location, recipe count, field count, provider,
 * replaceReviewed) and requires explicit confirmation before re-running the
 * same per-recipe fields through the REAL provider and persisting anything.
 * Non-interactively (no TTY, e.g. driven by another script), confirmation is
 * `RECIPE_TRANSLATION_CONFIRM=yes`; interactively, a y/n prompt is shown.
 *
 * REQUIRED ENVIRONMENT (never hardcode; export in your shell before running):
 *   NEXT_PUBLIC_SUPABASE_URL  -- same value apps/web uses
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY  -- same low-privilege key apps/web
 *       uses (an sb_publishable_* value; required, no legacy anon fallback)
 *   RECIPE_TRANSLATION_MANAGER_EMAIL, RECIPE_TRANSLATION_MANAGER_PASSWORD
 *       -- a real manager account with workforce.recipe.manage for the target tenant
 *   CONTENT_TRANSLATION_PROVIDER=google, GOOGLE_TRANSLATE_API_KEY  -- same vars the app reads
 *       (any other supported provider -- e.g. deepl/openai -- also works; the
 *       script always uses whatever resolveContentTranslationProvider() resolves)
 * OPTIONAL:
 *   RECIPE_TRANSLATION_TENANT_SLUG                        -- defaults to 'mame-to-cha'
 *   RECIPE_TRANSLATION_REPLACE_STALE_REVIEWED=true         -- defaults to false
 *   RECIPE_TRANSLATION_CONFIRM=yes                         -- skips the interactive prompt
 *
 * RUN (from apps/web):
 *   node --import tsx scripts/generate-recipe-translations.ts
 */

import { createInterface } from 'node:readline/promises';
import { createClient } from '@supabase/supabase-js';
import { requirePublicSupabaseEnv } from '../src/lib/supabase/env';
import { getUserFromClient } from '../src/lib/auth/user';
import { listTenantMemberships } from '../src/lib/tenant/membership';
import { listTenantLocations } from '../src/lib/tenant/locations';
import { resolvePreviewWorkforceModule } from '../src/lib/preview/module-guard';
import { resolveManagerLocation } from '../src/lib/preview/location';
import { selectPreviewMembership } from '../src/lib/preview/tenant-select';
import { listWorkforceRecipes, getWorkforceRecipeDetail } from '../src/lib/workforce/recipes';
import {
  buildRecipeTranslationWorkspace,
  flattenRecipeTranslationFields,
} from '../src/lib/content/recipe-translation-workspace';
import { listContentTranslationsForEntities, setMachineContentTranslation } from '../src/lib/content/translations';
import { runContentTranslationBatch, type TranslationCandidateField } from '../src/lib/content/translation-orchestrator';
import { resolveContentTranslationProvider } from '../src/lib/content/translation-provider-factory';
import type { ContentTranslationProvider, TranslateBatchResult } from '../src/lib/content/translation-provider';

/** Zero-network, zero-cost stand-in provider used only to size the dry run -- never used for the real write pass. */
const ECHO_PROVIDER: ContentTranslationProvider = {
  providerId: 'dry-run-echo',
  async translateBatch(input): Promise<TranslateBatchResult> {
    return { ok: true, translations: input.texts.map(() => '(dry-run placeholder)') };
  },
};

async function confirm(message: string): Promise<boolean> {
  if (process.env.RECIPE_TRANSLATION_CONFIRM?.trim().toLowerCase() === 'yes') return true;
  if (!process.stdin.isTTY) return false;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`${message} [y/N] `);
    return answer.trim().toLowerCase() === 'y';
  } finally {
    rl.close();
  }
}

const TENANT_SLUG = process.env.RECIPE_TRANSLATION_TENANT_SLUG?.trim() || 'mame-to-cha';
const REPLACE_STALE_REVIEWED = process.env.RECIPE_TRANSLATION_REPLACE_STALE_REVIEWED?.trim().toLowerCase() === 'true';

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

async function main() {
  const { url, key } = requirePublicSupabaseEnv();
  const managerEmail = requireEnv('RECIPE_TRANSLATION_MANAGER_EMAIL');
  const managerPassword = requireEnv('RECIPE_TRANSLATION_MANAGER_PASSWORD');

  const supabase = createClient(url, key);

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: managerEmail,
    password: managerPassword,
  });
  if (signInError) {
    console.error('Manager sign-in failed:', signInError.message);
    process.exit(1);
  }

  const user = await getUserFromClient(supabase);
  if (!user) {
    console.error('Sign-in succeeded but no session user was resolved.');
    process.exit(1);
  }

  const memberships = await listTenantMemberships(supabase, user.id);
  if (memberships.status !== 'success') {
    console.error('Could not read tenant memberships:', memberships.status);
    process.exit(1);
  }
  const membership = selectPreviewMembership(memberships.data, TENANT_SLUG);
  if (!membership) {
    console.error(`Signed-in manager has no active membership for tenant slug "${TENANT_SLUG}".`);
    process.exit(1);
  }
  const tenantId = membership.tenantId;

  const moduleResult = await resolvePreviewWorkforceModule(supabase, tenantId);
  if (moduleResult.status !== 'enabled') {
    console.error('Workforce module is not enabled for this tenant:', moduleResult.status);
    process.exit(1);
  }

  const locationsResult = await listTenantLocations(supabase);
  if (locationsResult.status !== 'success') {
    console.error('Could not read tenant locations:', locationsResult.status);
    process.exit(1);
  }
  const tenantLocations = locationsResult.data.filter((l) => l.tenantId === tenantId);
  const locationResult = resolveManagerLocation(tenantLocations);
  if (locationResult.kind !== 'ok') {
    console.error('Could not resolve exactly one manager location:', locationResult.kind);
    process.exit(1);
  }
  const locationId = locationResult.location.locationId;

  const { data: hasPermission, error: permissionError } = await supabase.schema('api').rpc('has_permission', {
    p_tenant_id: tenantId,
    p_permission: 'workforce.recipe.manage',
    p_location_id: locationId,
  });
  if (permissionError || hasPermission !== true) {
    console.error('Signed-in manager lacks workforce.recipe.manage for this tenant/location.');
    process.exit(1);
  }

  const provider = resolveContentTranslationProvider();
  if (!provider) {
    console.error('No content translation provider is configured (check CONTENT_TRANSLATION_PROVIDER and the matching API key, e.g. GOOGLE_TRANSLATE_API_KEY).');
    process.exit(1);
  }
  console.log(`Using translation provider: ${provider.providerId}`);

  const recipesResult = await listWorkforceRecipes(supabase, tenantId);
  if (recipesResult.status !== 'success') {
    console.error('Could not list recipes:', recipesResult.status);
    process.exit(1);
  }
  const recipes = recipesResult.data.filter((r) => r.locationId === null || r.locationId === locationId);

  // --- Phase 1: load every recipe's fields once (no writes, no provider calls yet) ---
  const perRecipeFields = new Map<string, TranslationCandidateField[]>();
  for (const recipe of recipes) {
    const detailResult = await getWorkforceRecipeDetail(supabase, tenantId, recipe.recipeId);
    if (detailResult.status !== 'success' || !detailResult.data) {
      console.error(`Skipping recipe ${recipe.recipeId}: could not load detail (${detailResult.status}).`);
      continue;
    }

    const fieldsForLookup = flattenRecipeTranslationFields(buildRecipeTranslationWorkspace(detailResult.data, []));
    const translationsResult = await listContentTranslationsForEntities(
      supabase,
      tenantId,
      fieldsForLookup.map((f) => ({ sourceEntityType: f.sourceEntityType, sourceEntityId: f.sourceEntityId })),
    );
    if (translationsResult.status !== 'success') {
      console.error(`Skipping recipe ${recipe.recipeId}: could not load existing translations (${translationsResult.status}).`);
      continue;
    }

    const workspace = buildRecipeTranslationWorkspace(detailResult.data, translationsResult.data);
    const fields = flattenRecipeTranslationFields(workspace).map((field) => ({
      sourceEntityType: field.sourceEntityType,
      sourceEntityId: field.sourceEntityId,
      sourceField: field.sourceField,
      sourceText: field.sourceText,
      existing: field.existing,
    }));
    perRecipeFields.set(recipe.recipeId, fields);
  }

  // --- Phase 2: dry run -- run the REAL orchestrator against the no-op echo provider ---
  let fieldsToTranslate = 0;
  for (const fields of perRecipeFields.values()) {
    const dryRunResult = await runContentTranslationBatch(fields, ECHO_PROVIDER, {
      replaceStaleReviewed: REPLACE_STALE_REVIEWED,
    });
    fieldsToTranslate += dryRunResult.accepted.length;
  }

  console.log('');
  console.log('=== Dry run summary (no writes performed yet) ===');
  console.log(`Tenant slug:            ${TENANT_SLUG}`);
  console.log(`Location id:            ${locationId}`);
  console.log(`Recipes found:          ${recipes.length}`);
  console.log(`Recipes loaded:         ${perRecipeFields.size}`);
  console.log(`Fields to translate:    ${fieldsToTranslate}`);
  console.log(`Selected provider:      ${provider.providerId}`);
  console.log(`replaceReviewed:        ${REPLACE_STALE_REVIEWED}`);
  console.log('');

  if (fieldsToTranslate === 0) {
    console.log('Nothing to translate -- exiting without further action.');
    await supabase.auth.signOut();
    return;
  }

  const confirmed = await confirm(`Proceed to call ${provider.providerId} and write ${fieldsToTranslate} translation(s)?`);
  if (!confirmed) {
    console.log('Not confirmed -- exiting without writing anything. (Set RECIPE_TRANSLATION_CONFIRM=yes to run non-interactively.)');
    await supabase.auth.signOut();
    return;
  }

  // --- Phase 3: real run -- same fields, real provider, real writes ---
  let recipesProcessed = 0;
  let translationsCreated = 0;
  let translationsFailed = 0;
  const skippedByReason = { reviewed: 0, empty: 0, current: 0, overLimit: 0 };

  for (const [recipeId, fields] of perRecipeFields.entries()) {
    const batchResult = await runContentTranslationBatch(fields, provider, {
      replaceStaleReviewed: REPLACE_STALE_REVIEWED,
    });

    recipesProcessed += 1;
    skippedByReason.reviewed += batchResult.skippedReviewed.length;
    skippedByReason.empty += batchResult.skippedEmpty.length;
    skippedByReason.current += batchResult.skippedCurrent.length;
    skippedByReason.overLimit += batchResult.skippedOverLimit.length;

    if (batchResult.error) {
      const attempted =
        fields.length -
        batchResult.skippedReviewed.length -
        batchResult.skippedEmpty.length -
        batchResult.skippedCurrent.length -
        batchResult.skippedOverLimit.length;
      console.error(`Recipe ${recipeId}: provider error (${batchResult.error.code}) -- ${attempted} field(s) not translated.`);
      translationsFailed += attempted;
      continue;
    }

    for (const accepted of batchResult.accepted) {
      const writeResult = await setMachineContentTranslation(supabase, tenantId, {
        sourceEntityType: accepted.sourceEntityType,
        sourceEntityId: accepted.sourceEntityId,
        sourceField: accepted.sourceField,
        translatedText: accepted.translatedText,
        sourceContentHash: accepted.sourceContentHash,
        replaceReviewed: REPLACE_STALE_REVIEWED,
        translationProvider: provider.providerId,
      });
      if (writeResult.status === 'success') {
        translationsCreated += 1;
      } else {
        translationsFailed += 1;
        console.error(`Recipe ${recipeId}, field ${accepted.sourceField}: write failed (${writeResult.status}).`);
      }
    }
  }

  console.log('');
  console.log('=== Recipe translation generation summary ===');
  console.log(`Tenant slug:            ${TENANT_SLUG}`);
  console.log(`Provider:               ${provider.providerId}`);
  console.log(`Recipes processed:      ${recipesProcessed} / ${perRecipeFields.size}`);
  console.log(`Translations created:   ${translationsCreated}`);
  console.log(`Skipped (reviewed):     ${skippedByReason.reviewed}`);
  console.log(`Skipped (empty field):  ${skippedByReason.empty}`);
  console.log(`Skipped (already current): ${skippedByReason.current}`);
  console.log(`Skipped (over limit):   ${skippedByReason.overLimit}`);
  console.log(`Failed:                 ${translationsFailed}`);

  await supabase.auth.signOut();
}

main().catch((err) => {
  console.error('Unexpected error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
