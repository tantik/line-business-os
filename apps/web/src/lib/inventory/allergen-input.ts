/**
 * Decides what the Inventory item form's allergen fields ask the server to
 * write (Copy Audit A-09 UX review, 2026-10-12). Pure, so the decision is
 * unit-tested apart from the Server Action that applies it.
 *
 * - `allergensConfirmed === 'true'` -> write the ticked codes (`[]` = the
 *   store confirmed none).
 * - not confirmed, but the form loaded the item as confirmed
 *   (`allergensInitiallyConfirmed === 'true'`) -> the Manager revoked the
 *   confirmation: write NULL (not recorded), so a stale '{}' cannot keep
 *   claiming "contains none".
 * - otherwise (new item, or never configured and left untouched) -> write
 *   nothing; NULL stays NULL.
 * - the form did not send `allergensConfirmed` at all (the allergen block is
 *   hidden because the tenant's package config has `allergens: false`, task
 *   P6) -> write nothing, whatever else was sent. Absence never means
 *   "none" or "revoked": the item's stored codes/confirmation stay as they
 *   are.
 */
export type AllergenWriteDecision =
  | { kind: 'skip' }
  | { kind: 'set'; codes: string[] | null }
  | { kind: 'invalid' };

export function decideAllergenWrite(formData: FormData): AllergenWriteDecision {
  if (!formData.has('allergensConfirmed')) return { kind: 'skip' };

  if (formData.get('allergensConfirmed') === 'true') {
    const raw = formData.get('allergenCodesJson');
    if (typeof raw !== 'string' || raw === '') return { kind: 'set', codes: [] };
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.every((code) => typeof code === 'string')) {
        return { kind: 'set', codes: parsed };
      }
      return { kind: 'invalid' };
    } catch {
      return { kind: 'invalid' };
    }
  }

  if (formData.get('allergensInitiallyConfirmed') === 'true') {
    return { kind: 'set', codes: null };
  }

  return { kind: 'skip' };
}
