import { parseOptionalTrimmedString, parseTrimmedString, parseUuid } from './validation';

export interface UpsertRecipeInput {
  recipeId: string | null;
  contentKind: 'recipe' | 'instruction';
  titleJa: string;
  descriptionJa: string | null;
  status: 'draft' | 'published';
  ingredients: string[];
  steps: string[];
  noteTitle: string | null;
  noteBody: string | null;
  mediaPath: string | null;
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
  if (status !== 'draft' && status !== 'published') return null;
  const titleJa = parseTrimmedString(formData.get('titleJa'), 160);
  if (!titleJa) return null;
  const description = parseOptionalTrimmedString(formData.get('descriptionJa'), 1000);
  const noteTitle = parseOptionalTrimmedString(formData.get('noteTitle'), 160);
  const noteBody = parseOptionalTrimmedString(formData.get('noteBody'), 4000);
  if (!description.ok || !noteTitle.ok || !noteBody.ok || (noteTitle.value && !noteBody.value)) return null;
  const ingredients = lines(formData.get('ingredients'), 100, 500);
  const steps = lines(formData.get('steps'), 100, 2000);
  if (!ingredients || !steps) return null;
  return { recipeId, contentKind, titleJa, descriptionJa: description.value, status, ingredients, steps,
    noteTitle: noteTitle.value, noteBody: noteBody.value, mediaPath: null };
}
