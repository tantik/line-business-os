import { parseOptionalTrimmedString, parseTrimmedString, parseUuid } from './validation';

export interface UpsertRecipeInput {
  recipeId: string | null;
  contentKind: 'recipe' | 'instruction';
  /** Human-authored text in `originalLanguage` (not always Japanese -- see `originalLanguage`). */
  title: string;
  description: string | null;
  status: 'draft' | 'published' | 'archived';
  ingredients: string[];
  steps: string[];
  noteTitle: string | null;
  noteBody: string | null;
  mediaPath: string | null;
  /** The language this recipe's human-authored content is written in. Translation always flows from this language to the other one. */
  originalLanguage: 'ja' | 'en';
  /** Explicit confirmation required only when changing `originalLanguage` on an EXISTING recipe that already has content -- never defaults to true. */
  confirmLanguageChange?: boolean;
}

function lines(value: FormDataEntryValue | null, maxLines: number, maxLineLength: number): string[] | null {
  if (typeof value !== 'string') return [];
  const parsed = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (parsed.length > maxLines || parsed.some((line) => line.length > maxLineLength)) return null;
  return parsed;
}

export function parseUpsertRecipeInput(formData: FormData): UpsertRecipeInput | null {
  const rawId = formData.get('recipeId');
  const recipeId = typeof rawId === 'string' && rawId.trim() ? parseUuid(rawId) : null;
  if (typeof rawId === 'string' && rawId.trim() && !recipeId) return null;
  const contentKind = formData.get('contentKind');
  const status = formData.get('status');
  if (contentKind !== 'recipe' && contentKind !== 'instruction') return null;
  if (status !== 'draft' && status !== 'published' && status !== 'archived') return null;
  const rawOriginalLanguage = formData.get('originalLanguage');
  const originalLanguage = rawOriginalLanguage === 'en' ? 'en' : rawOriginalLanguage === 'ja' ? 'ja' : null;
  if (!originalLanguage) return null;
  const title = parseTrimmedString(formData.get('title'), 160);
  if (!title) return null;
  const description = parseOptionalTrimmedString(formData.get('description'), 1000);
  const noteTitle = parseOptionalTrimmedString(formData.get('noteTitle'), 160);
  const noteBody = parseOptionalTrimmedString(formData.get('noteBody'), 4000);
  // Note title and note body are each independently optional (form labels
  // both "(optional)") -- previously a note title without a body silently
  // rejected the whole form with a generic "Invalid input" error, even
  // though the RPC itself (0058) already tolerates a title-only note by
  // just skipping the note insert when the body is empty.
  if (!description.ok || !noteTitle.ok || !noteBody.ok) return null;
  const ingredients = lines(formData.get('ingredients'), 100, 500);
  const steps = lines(formData.get('steps'), 100, 2000);
  if (!ingredients || !steps) return null;
  const confirmLanguageChange = formData.get('confirmLanguageChange') === 'true';
  return {
    recipeId, contentKind, title, description: description.value, status, ingredients, steps,
    noteTitle: noteTitle.value, noteBody: noteBody.value, mediaPath: null,
    originalLanguage, confirmLanguageChange,
  };
}
