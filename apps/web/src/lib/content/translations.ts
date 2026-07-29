import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { TenantAccessResult } from '@/lib/tenant/types';

/**
 * Reusable, cross-module user-generated-content translation service layer
 * (`content.translations`, 0039/0040). Recipes is the first caller; nothing
 * here is Recipes- or tenant-specific -- any future module (manuals,
 * checklists, inventory item descriptions, knowledge base, booking
 * instructions) can reuse these functions unchanged by passing its own
 * `sourceEntityType`.
 *
 * MVP SCOPE: only a manual (human-authored) write path exists
 * (`setContentTranslation`, calling `api.set_content_translation`, which
 * always stamps `translation_status = 'reviewed'`, `translation_provider =
 * 'manual'`). No automatic/machine-translation provider is called anywhere
 * in this module -- see the implementation report's "User-generated content
 * translation" section for what is deferred and why.
 */

export type ContentSourceEntityType =
  | 'workforce_recipe'
  | 'workforce_recipe_ingredient'
  | 'workforce_recipe_step'
  | 'workforce_recipe_note';

export type ContentSourceField = 'title' | 'description' | 'label' | 'instruction' | 'note_title' | 'note_body';

/** Only target language supported by this MVP (source is always Japanese). */
export type ContentTargetLanguage = 'en';

export type ContentTranslationStatus = 'machine' | 'reviewed' | 'stale' | 'failed';

/** Flat row shape returned by `api.content_translations`. */
interface ApiContentTranslationRow {
  translation_id: string;
  tenant_id: string;
  source_entity_type: ContentSourceEntityType;
  source_entity_id: string;
  source_field: ContentSourceField;
  source_language: string;
  target_language: ContentTargetLanguage;
  translated_text: string;
  translation_status: ContentTranslationStatus;
  translation_provider: string;
  source_content_hash: string;
  machine_generated: boolean;
  reviewed_at: string | null;
  translated_at: string;
  updated_at: string;
}

export interface ContentTranslation {
  translationId: string;
  tenantId: string;
  sourceEntityType: ContentSourceEntityType;
  sourceEntityId: string;
  sourceField: ContentSourceField;
  sourceLanguage: string;
  targetLanguage: ContentTargetLanguage;
  translatedText: string;
  status: ContentTranslationStatus;
  provider: string;
  sourceContentHash: string;
  machineGenerated: boolean;
  reviewedAt: string | null;
  translatedAt: string;
  updatedAt: string;
}

function mapRow(row: ApiContentTranslationRow): ContentTranslation {
  return {
    translationId: row.translation_id,
    tenantId: row.tenant_id,
    sourceEntityType: row.source_entity_type,
    sourceEntityId: row.source_entity_id,
    sourceField: row.source_field,
    sourceLanguage: row.source_language,
    targetLanguage: row.target_language,
    translatedText: row.translated_text,
    status: row.translation_status,
    provider: row.translation_provider,
    sourceContentHash: row.source_content_hash,
    machineGenerated: row.machine_generated,
    reviewedAt: row.reviewed_at,
    translatedAt: row.translated_at,
    updatedAt: row.updated_at,
  };
}

/** Deterministic hash of a source field's current text, used for staleness comparison. Never trusted as a client-supplied "still fresh" flag -- always recomputed server-side from the actual source text before comparing/storing. */
export function hashSourceText(text: string): string {
  return createHash('sha256').update(text.trim()).digest('hex');
}

/**
 * True when a stored translation's `sourceContentHash` no longer matches the
 * source field's current text -- i.e. the original changed since this
 * translation was produced. Callers should treat a stale translation the
 * same as "no translation" for display purposes (fall back to the original),
 * per the brief's "explicitly indicate stale, never silently serve it".
 */
export function isTranslationStale(translation: ContentTranslation, currentSourceText: string): boolean {
  return translation.sourceContentHash !== hashSourceText(currentSourceText);
}

/** Reads every translation for one source entity (all fields/target languages) through the app-facing API facade. */
export async function listContentTranslationsForEntity(
  supabase: SupabaseClient,
  tenantId: string,
  sourceEntityType: ContentSourceEntityType,
  sourceEntityId: string,
): Promise<TenantAccessResult<ContentTranslation[]>> {
  try {
    const { data, error } = await supabase
      .schema('api')
      .from('content_translations')
      .select(
        'translation_id, tenant_id, source_entity_type, source_entity_id, source_field, source_language, target_language, translated_text, translation_status, translation_provider, source_content_hash, machine_generated, reviewed_at, translated_at, updated_at',
      )
      .eq('tenant_id', tenantId)
      .eq('source_entity_type', sourceEntityType)
      .eq('source_entity_id', sourceEntityId);

    if (error) {
      if (error.code === '42501' || /permission denied|row-level security/i.test(error.message)) {
        return { status: 'unauthorized', message: 'Not permitted to read this content translation.' };
      }
      return { status: 'unexpected_error', message: 'Unable to load content translations right now.' };
    }

    return { status: 'success', data: (data ?? []).map((row) => mapRow(row as ApiContentTranslationRow)) };
  } catch (err) {
    return {
      status: 'unexpected_error',
      message: err instanceof Error ? err.message : 'Unexpected error reading content translations.',
    };
  }
}

/**
 * Reads translations for MULTIPLE source entities (e.g. a recipe plus all
 * its ingredients/steps/notes) in one query, instead of one round trip per
 * entity. `refs` narrows the result to exactly the (type, id) pairs
 * requested -- `.in('source_entity_id', ...)` alone would over-fetch if two
 * different source_entity_types ever collided on the same id (they can't in
 * practice, since these are separate tables' primary keys, but the type
 * check costs nothing and keeps the contract explicit). RLS still applies
 * per row regardless of this filtering.
 */
export async function listContentTranslationsForEntities(
  supabase: SupabaseClient,
  tenantId: string,
  refs: { sourceEntityType: ContentSourceEntityType; sourceEntityId: string }[],
): Promise<TenantAccessResult<ContentTranslation[]>> {
  if (refs.length === 0) return { status: 'success', data: [] };

  try {
    const ids = [...new Set(refs.map((ref) => ref.sourceEntityId))];
    const { data, error } = await supabase
      .schema('api')
      .from('content_translations')
      .select(
        'translation_id, tenant_id, source_entity_type, source_entity_id, source_field, source_language, target_language, translated_text, translation_status, translation_provider, source_content_hash, machine_generated, reviewed_at, translated_at, updated_at',
      )
      .eq('tenant_id', tenantId)
      .in('source_entity_id', ids);

    if (error) {
      if (error.code === '42501' || /permission denied|row-level security/i.test(error.message)) {
        return { status: 'unauthorized', message: 'Not permitted to read this content translation.' };
      }
      return { status: 'unexpected_error', message: 'Unable to load content translations right now.' };
    }

    const refSet = new Set(refs.map((ref) => `${ref.sourceEntityType}:${ref.sourceEntityId}`));
    const rows = ((data ?? []) as ApiContentTranslationRow[]).filter((row) =>
      refSet.has(`${row.source_entity_type}:${row.source_entity_id}`),
    );
    return { status: 'success', data: rows.map(mapRow) };
  } catch (err) {
    return {
      status: 'unexpected_error',
      message: err instanceof Error ? err.message : 'Unexpected error reading content translations.',
    };
  }
}

export type SetMachineContentTranslationResult =
  | { status: 'success'; data: { translationId: string; status: ContentTranslationStatus } }
  | { status: 'reviewed_conflict' }
  | TenantAccessResult<never>;

export interface SetMachineContentTranslationInput {
  sourceEntityType: ContentSourceEntityType;
  sourceEntityId: string;
  sourceField: ContentSourceField;
  translatedText: string;
  sourceContentHash: string;
  replaceReviewed?: boolean;
}

/**
 * Automatic (provider-generated) translation upsert via
 * `api.set_machine_content_translation` (0041). Callers (the translation
 * orchestrator's caller, never Staff-facing code) are expected to have
 * already excluded `reviewed` fields; this still surfaces the DB's own
 * defense-in-depth refusal as `reviewed_conflict` rather than a generic
 * error, so a caller bug doesn't look like a mystery failure.
 */
export async function setMachineContentTranslation(
  supabase: SupabaseClient,
  tenantId: string,
  input: SetMachineContentTranslationInput,
): Promise<SetMachineContentTranslationResult> {
  try {
    const { data, error } = await supabase
      .schema('api')
      .rpc('set_machine_content_translation_confirmed', {
        p_tenant_id: tenantId,
        p_source_entity_type: input.sourceEntityType,
        p_source_entity_id: input.sourceEntityId,
        p_source_field: input.sourceField,
        p_translated_text: input.translatedText,
        p_source_content_hash: input.sourceContentHash,
        p_replace_reviewed: input.replaceReviewed ?? false,
      })
      .maybeSingle();

    if (error) {
      if (error.message?.includes('content_translation_requires_force')) {
        return { status: 'reviewed_conflict' };
      }
      if (error.code === '42501' || /permission denied|row-level security/i.test(error.message)) {
        return { status: 'unauthorized', message: 'Not permitted to manage this translation.' };
      }
      return { status: 'unexpected_error', message: 'Unable to save this translation right now.' };
    }
    if (!data) return { status: 'unexpected_error', message: 'Unable to save this translation right now.' };

    const row = data as { translation_id: string; translation_status: ContentTranslationStatus };
    return { status: 'success', data: { translationId: row.translation_id, status: row.translation_status } };
  } catch (err) {
    return {
      status: 'unexpected_error',
      message: err instanceof Error ? err.message : 'Unexpected error saving this translation.',
    };
  }
}

export type MarkContentTranslationReviewedResult =
  | { status: 'success'; data: { translationId: string; status: ContentTranslationStatus } }
  | { status: 'not_found' }
  | TenantAccessResult<never>;

/** Confirms an existing translation as reviewed via `api.mark_content_translation_reviewed` (0041). */
export async function markContentTranslationReviewed(
  supabase: SupabaseClient,
  tenantId: string,
  translationId: string,
): Promise<MarkContentTranslationReviewedResult> {
  try {
    const { data, error } = await supabase
      .schema('api')
      .rpc('mark_content_translation_reviewed', { p_tenant_id: tenantId, p_translation_id: translationId })
      .maybeSingle();

    if (error) {
      if (error.code === '42501' || /permission denied|row-level security/i.test(error.message)) {
        return { status: 'unauthorized', message: 'Not permitted to manage this translation.' };
      }
      return { status: 'unexpected_error', message: 'Unable to update this translation right now.' };
    }
    if (!data) return { status: 'not_found' };

    const row = data as { translation_id: string; translation_status: ContentTranslationStatus };
    return { status: 'success', data: { translationId: row.translation_id, status: row.translation_status } };
  } catch (err) {
    return {
      status: 'unexpected_error',
      message: err instanceof Error ? err.message : 'Unexpected error updating this translation.',
    };
  }
}

export type SetContentTranslationResult =
  | { status: 'success'; data: { translationId: string; status: ContentTranslationStatus } }
  | { status: 'confirm_required' }
  | TenantAccessResult<never>;

export interface SetContentTranslationInput {
  sourceEntityType: ContentSourceEntityType;
  sourceEntityId: string;
  sourceField: ContentSourceField;
  targetLanguage: ContentTargetLanguage;
  translatedText: string;
  /** The CURRENT source text -- hashed here, never trusted as a pre-computed hash from the client. */
  currentSourceText: string;
  /** Explicit human confirmation to replace an existing `reviewed` translation. Never defaults to true. */
  force?: boolean;
}

/**
 * Manual (Manager-authored) translation upsert via `api.set_content_translation`
 * (0040). `tenantId` is always the server-resolved active tenant. RLS
 * (`content_translations_insert`/`_update`, gated on `workforce.recipe.manage`
 * for the owning recipe) is the real authorization boundary -- manager-only.
 */
export async function setContentTranslation(
  supabase: SupabaseClient,
  tenantId: string,
  input: SetContentTranslationInput,
): Promise<SetContentTranslationResult> {
  try {
    const { data, error } = await supabase
      .schema('api')
      .rpc('set_content_translation', {
        p_tenant_id: tenantId,
        p_source_entity_type: input.sourceEntityType,
        p_source_entity_id: input.sourceEntityId,
        p_source_field: input.sourceField,
        p_target_language: input.targetLanguage,
        p_translated_text: input.translatedText,
        p_source_content_hash: hashSourceText(input.currentSourceText),
        p_force: input.force ?? false,
      })
      .maybeSingle();

    if (error) {
      if (error.message?.includes('content_translation_requires_force')) {
        return { status: 'confirm_required' };
      }
      if (error.code === '42501' || /permission denied|row-level security/i.test(error.message)) {
        return { status: 'unauthorized', message: 'Not permitted to manage this translation.' };
      }
      return { status: 'unexpected_error', message: 'Unable to save this translation right now.' };
    }
    if (!data) return { status: 'unexpected_error', message: 'Unable to save this translation right now.' };

    const row = data as { translation_id: string; translation_status: ContentTranslationStatus };
    return { status: 'success', data: { translationId: row.translation_id, status: row.translation_status } };
  } catch (err) {
    return {
      status: 'unexpected_error',
      message: err instanceof Error ? err.message : 'Unexpected error saving this translation.',
    };
  }
}
