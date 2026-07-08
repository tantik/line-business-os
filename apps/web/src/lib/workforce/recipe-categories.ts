import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import type { TenantAccessResult } from '@/lib/tenant/types';

/** Flat row shape returned by `api.workforce_recipe_categories`. */
interface ApiWorkforceRecipeCategoryRow {
  category_id: string;
  tenant_id: string;
  label_ja: string;
  label_en: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface WorkforceRecipeCategory {
  categoryId: string;
  tenantId: string;
  labelJa: string;
  labelEn: string | null;
  sortOrder: number;
  isActive: boolean;
}

function mapPostgrestError(error: PostgrestError): TenantAccessResult<never> {
  // 42501 = insufficient_privilege; PostgREST also surfaces "permission denied".
  if (error.code === '42501' || /permission denied/i.test(error.message)) {
    return { status: 'unauthorized', message: 'Not permitted to read workforce recipe categories.' };
  }
  return { status: 'unexpected_error', message: error.message };
}

function compareCategories(a: WorkforceRecipeCategory, b: WorkforceRecipeCategory): number {
  const bySort = a.sortOrder - b.sortOrder;
  if (bySort !== 0) return bySort;

  return a.labelJa.localeCompare(b.labelJa);
}

/**
 * Read workforce recipe categories through the app-facing API facade,
 * narrowed to the active tenant.
 *
 * `api.workforce_recipe_categories` has no additional WHERE beyond RLS
 * (`wf_recipe_categories_select`); the `tenant_id` filter here is a display
 * narrowing only, not the security boundary.
 */
export async function listWorkforceRecipeCategories(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<TenantAccessResult<WorkforceRecipeCategory[]>> {
  try {
    const { data, error } = await supabase
      .schema('api')
      .from('workforce_recipe_categories')
      .select('category_id, tenant_id, label_ja, label_en, sort_order, is_active')
      .eq('tenant_id', tenantId);

    if (error) return mapPostgrestError(error);

    const rows = (data ?? []) as ApiWorkforceRecipeCategoryRow[];
    const categories = rows.map((row) => ({
      categoryId: row.category_id,
      tenantId: row.tenant_id,
      labelJa: row.label_ja,
      labelEn: row.label_en,
      sortOrder: row.sort_order,
      isActive: row.is_active,
    }));

    categories.sort(compareCategories);
    return { status: 'success', data: categories };
  } catch (err) {
    return {
      status: 'unexpected_error',
      message: err instanceof Error ? err.message : 'Unexpected error reading workforce recipe categories.',
    };
  }
}
