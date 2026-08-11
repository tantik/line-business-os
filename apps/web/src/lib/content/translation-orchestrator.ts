import { hashSourceText, isTranslationStale } from './translations';
import type { ContentSourceEntityType, ContentSourceField, ContentTranslation } from './translations';
import type { ContentTranslationProvider, ContentTranslationProviderError } from './translation-provider';

/**
 * Pure(ish) orchestration of "which recipe fields need a machine translation
 * right now, and how do provider responses map back to them" -- deliberately
 * has NO Supabase import, so it is fully unit-testable with a fake provider
 * and plain fixtures. The caller (a Server Action) is responsible for all
 * I/O: loading source fields + existing translations from the DB before
 * calling this, and persisting `accepted` entries via
 * `api.set_machine_content_translation` after.
 *
 * Decision rules (per the product brief):
 * - A field with a `reviewed` translation is NEVER included in a batch,
 *   regardless of whether the source changed since -- only a manual edit
 *   (with explicit force) can replace a reviewed translation.
 * - A field whose CURRENT (non-stale) translation already exists and is not
 *   reviewed (i.e. `machine`) is also skipped -- a recipe is never
 *   retranslated on every open, only when missing or stale.
 * - An empty/whitespace-only source field is never sent to the provider.
 * - Fields are capped by per-field length, total batch character budget, and
 *   batch size, evaluated in input order -- fields beyond any limit are
 *   reported back as skipped, never silently dropped.
 */

const PER_FIELD_MAX_LENGTH = 2_000;
const TOTAL_BATCH_CHAR_BUDGET = 20_000;
const BATCH_SIZE_CAP = 50;

export interface TranslationFieldRef {
  sourceEntityType: ContentSourceEntityType;
  sourceEntityId: string;
  sourceField: ContentSourceField;
}

export interface TranslationCandidateField extends TranslationFieldRef {
  sourceText: string;
  existing: ContentTranslation | null;
}

export interface AcceptedTranslationField extends TranslationFieldRef {
  translatedText: string;
  sourceContentHash: string;
}

export interface RunTranslationBatchResult {
  accepted: AcceptedTranslationField[];
  skippedReviewed: TranslationFieldRef[];
  skippedEmpty: TranslationFieldRef[];
  skippedCurrent: TranslationFieldRef[];
  skippedOverLimit: TranslationFieldRef[];
  error?: ContentTranslationProviderError;
}

function fieldRef(field: TranslationCandidateField): TranslationFieldRef {
  return {
    sourceEntityType: field.sourceEntityType,
    sourceEntityId: field.sourceEntityId,
    sourceField: field.sourceField,
  };
}

export async function runContentTranslationBatch(
  fields: TranslationCandidateField[],
  provider: ContentTranslationProvider,
  options: {
    replaceStaleReviewed?: boolean;
    /** Direction for this whole batch -- always one recipe's original_language -> the other language, never guessed per field. Defaults to ja->en for backward compatibility with existing callers/tests. */
    sourceLang?: 'ja' | 'en';
    targetLang?: 'ja' | 'en';
  } = {},
): Promise<RunTranslationBatchResult> {
  const sourceLang = options.sourceLang ?? 'ja';
  const targetLang = options.targetLang ?? 'en';
  const skippedReviewed: TranslationFieldRef[] = [];
  const skippedEmpty: TranslationFieldRef[] = [];
  const skippedCurrent: TranslationFieldRef[] = [];
  const skippedOverLimit: TranslationFieldRef[] = [];
  const candidates: TranslationCandidateField[] = [];

  for (const field of fields) {
    if (field.sourceText.trim().length === 0) {
      skippedEmpty.push(fieldRef(field));
      continue;
    }
    if (
      field.existing?.status === 'reviewed' &&
      !(options.replaceStaleReviewed && isTranslationStale(field.existing, field.sourceText))
    ) {
      skippedReviewed.push(fieldRef(field));
      continue;
    }
    if (field.existing && !isTranslationStale(field.existing, field.sourceText)) {
      skippedCurrent.push(fieldRef(field));
      continue;
    }
    if (field.sourceText.length > PER_FIELD_MAX_LENGTH) {
      skippedOverLimit.push(fieldRef(field));
      continue;
    }
    candidates.push(field);
  }

  const batch: TranslationCandidateField[] = [];
  let runningTotal = 0;
  for (const field of candidates) {
    if (batch.length >= BATCH_SIZE_CAP || runningTotal + field.sourceText.length > TOTAL_BATCH_CHAR_BUDGET) {
      skippedOverLimit.push(fieldRef(field));
      continue;
    }
    batch.push(field);
    runningTotal += field.sourceText.length;
  }

  if (batch.length === 0) {
    return { accepted: [], skippedReviewed, skippedEmpty, skippedCurrent, skippedOverLimit };
  }

  const result = await provider.translateBatch({
    texts: batch.map((field) => field.sourceText),
    sourceLang,
    targetLang,
  });

  if (!result.ok) {
    return { accepted: [], skippedReviewed, skippedEmpty, skippedCurrent, skippedOverLimit, error: result.error };
  }

  const accepted: AcceptedTranslationField[] = batch.map((field, index) => ({
    ...fieldRef(field),
    translatedText: result.translations[index]!,
    sourceContentHash: hashSourceText(field.sourceText),
  }));

  return { accepted, skippedReviewed, skippedEmpty, skippedCurrent, skippedOverLimit };
}
