import { parseOptionalTrimmedString, parseTrimmedString, parseUuid } from './validation';

const RECIPE_INGREDIENT_UNITS = ['kg', 'g', 'L', 'mL', 'pcs'] as const;
export type RecipeIngredientUnit = (typeof RECIPE_INGREDIENT_UNITS)[number];

/**
 * One ingredient element as sent to `api.upsert_workforce_recipe` (WP5). A
 * plain string stays fully supported server-side for backward compatibility,
 * but the canonical Manager form (`recipe-form.tsx`) now always submits this
 * object shape -- `inventory_item_id: null` means a bare label with no
 * Inventory mapping (the common, fully valid case), never a required field.
 * Snake_case keys match the RPC's jsonb contract directly (this is a
 * boundary payload, not a general app-level type).
 */
export interface UpsertRecipeIngredientInput {
  label: string;
  inventory_item_id: string | null;
  quantity: number | null;
  unit: RecipeIngredientUnit | null;
}

export interface UpsertRecipeInput {
  recipeId: string | null;
  contentKind: 'recipe' | 'instruction';
  /** Human-authored text in `originalLanguage` (not always Japanese -- see `originalLanguage`). */
  title: string;
  description: string | null;
  status: 'draft' | 'published' | 'archived';
  ingredients: UpsertRecipeIngredientInput[];
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

/**
 * Parses the `ingredientsJson` field the recipe form submits (WP5): a JSON
 * array of `{ label, inventoryItemId, quantity, unit }` rows from the
 * structured per-ingredient editor. Returns `null` on any structural
 * violation (fails closed, mirrors `lines()`'s own contract) -- the RPC's own
 * validation (`recipe_invalid_ingredient`/`recipe_invalid_ingredient_mapping`)
 * is the authoritative check regardless, this is a fast-fail shape guard.
 */
function parseIngredientsJson(value: FormDataEntryValue | null, maxRows: number, maxLabelLength: number): UpsertRecipeIngredientInput[] | null {
  if (typeof value !== 'string' || !value.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length > maxRows) return null;

  const result: UpsertRecipeIngredientInput[] = [];
  for (const entry of parsed) {
    if (typeof entry !== 'object' || entry === null) return null;
    const row = entry as Record<string, unknown>;
    const label = typeof row.label === 'string' ? row.label.trim() : '';
    if (!label || label.length > maxLabelLength) return null;

    const rawItemId = row.inventoryItemId;
    const inventoryItemId = typeof rawItemId === 'string' && rawItemId ? parseUuid(rawItemId) : null;
    if (rawItemId !== null && rawItemId !== undefined && rawItemId !== '' && !inventoryItemId) return null;

    const rawQuantity = row.quantity;
    const quantity = typeof rawQuantity === 'number' && Number.isFinite(rawQuantity) ? rawQuantity : null;
    if (rawQuantity !== null && rawQuantity !== undefined && quantity === null) return null;

    const rawUnit = row.unit;
    const unit = RECIPE_INGREDIENT_UNITS.includes(rawUnit as RecipeIngredientUnit) ? (rawUnit as RecipeIngredientUnit) : null;
    if (rawUnit !== null && rawUnit !== undefined && !unit) return null;

    // All-or-nothing mapping triple, mirrored client-side (server CHECK/RPC re-enforces this regardless).
    if (inventoryItemId ? quantity === null || quantity <= 0 || !unit : quantity !== null || unit !== null) return null;

    result.push({ label, inventory_item_id: inventoryItemId, quantity, unit });
  }
  return result;
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
  const ingredients = parseIngredientsJson(formData.get('ingredientsJson'), 100, 500);
  const steps = lines(formData.get('steps'), 100, 2000);
  if (!ingredients || !steps) return null;
  const confirmLanguageChange = formData.get('confirmLanguageChange') === 'true';
  return {
    recipeId, contentKind, title, description: description.value, status, ingredients, steps,
    noteTitle: noteTitle.value, noteBody: noteBody.value, mediaPath: null,
    originalLanguage, confirmLanguageChange,
  };
}
