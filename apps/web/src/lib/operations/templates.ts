import type { SupabaseClient } from '@supabase/supabase-js';
import type { TenantAccessResult } from '@/lib/tenant/types';
import type { OperationsWriteResult } from './result-types';
import { mapOperationsReadError, mapOperationsWriteError } from './pg-error';
import type { OperationsResponseType } from './validation';

/**
 * Manager configuration read/write service layer for Operations checklist
 * templates + items (Cafe v2.2 WP1 Operations, first UI slice --
 * Templates/Items only, no scheduling, no task execution). Reads go through
 * the two `api.*` `security_invoker` views (0100); writes go through the
 * `api.operations_*` configuration RPCs (0105) -- never a raw
 * `operations.*` table write. Every helper here is the single place these
 * Supabase calls happen; Server Actions in `templates-actions.ts` are thin
 * controllers that only validate input and delegate here.
 */

/** Flat row shape returned by `api.operations_templates` (0100). NOTE: the view does not expose `retired_on` (only the base `operations.checklist_templates` table column added by 0104 does) -- `isActive` is the only client-visible retirement signal in this slice. This is a documented view/brief discrepancy, not a bug in this code; the atomic `api.operations_retire_template` RPC guarantees `is_active=false` iff retired, so `isActive` alone is a reliable active/retired split even without the exact `retired_on` date. */
interface ApiOperationsTemplateRow {
  template_id: string;
  tenant_id: string;
  location_id: string | null;
  name: string;
  category: string | null;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface OperationsTemplate {
  templateId: string;
  tenantId: string;
  locationId: string | null;
  name: string;
  category: string | null;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

function mapTemplateRow(row: ApiOperationsTemplateRow): OperationsTemplate {
  return {
    templateId: row.template_id,
    tenantId: row.tenant_id,
    locationId: row.location_id,
    name: row.name,
    category: row.category,
    description: row.description,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const TEMPLATE_SELECT = 'template_id, tenant_id, location_id, name, category, description, is_active, created_at, updated_at';

/** Read every operational checklist template the caller may see (RLS-scoped: module ON + `operations.task.read`/`operations.template.manage`, tenant/location isolated). */
export async function listOperationsTemplates(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<TenantAccessResult<OperationsTemplate[]>> {
  try {
    const { data, error } = await supabase.schema('api').from('operations_templates').select(TEMPLATE_SELECT).eq('tenant_id', tenantId);
    if (error) return mapOperationsReadError(error, 'read Operations templates');

    const rows = (data ?? []) as ApiOperationsTemplateRow[];
    const templates = rows.map(mapTemplateRow).sort((a, b) => a.name.localeCompare(b.name) || a.templateId.localeCompare(b.templateId));
    return { status: 'success', data: templates };
  } catch (err) {
    return { status: 'unexpected_error', message: err instanceof Error ? err.message : 'Unexpected error reading Operations templates.' };
  }
}

/** Flat row shape returned by `api.operations_template_items` (0100). */
interface ApiOperationsTemplateItemRow {
  item_id: string;
  tenant_id: string;
  template_id: string;
  label: string;
  response_type: OperationsResponseType;
  is_critical: boolean;
  is_required: boolean;
  is_active: boolean;
  numeric_min: number | null;
  numeric_max: number | null;
  numeric_unit: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface OperationsTemplateItem {
  itemId: string;
  tenantId: string;
  templateId: string;
  label: string;
  responseType: OperationsResponseType;
  isCritical: boolean;
  isRequired: boolean;
  isActive: boolean;
  numericMin: number | null;
  numericMax: number | null;
  numericUnit: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

function mapItemRow(row: ApiOperationsTemplateItemRow): OperationsTemplateItem {
  return {
    itemId: row.item_id,
    tenantId: row.tenant_id,
    templateId: row.template_id,
    label: row.label,
    responseType: row.response_type,
    isCritical: row.is_critical,
    isRequired: row.is_required,
    isActive: row.is_active,
    numericMin: row.numeric_min,
    numericMax: row.numeric_max,
    numericUnit: row.numeric_unit,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const ITEM_SELECT =
  'item_id, tenant_id, template_id, label, response_type, is_critical, is_required, is_active, numeric_min, numeric_max, numeric_unit, sort_order, created_at, updated_at';

/** Read every checklist item for templates the caller may see (visibility mirrors `listOperationsTemplates` via RLS). Not scoped to one template -- the caller groups by `templateId` client-side, same shape as this slice's template list. */
export async function listOperationsTemplateItems(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<TenantAccessResult<OperationsTemplateItem[]>> {
  try {
    const { data, error } = await supabase.schema('api').from('operations_template_items').select(ITEM_SELECT).eq('tenant_id', tenantId);
    if (error) return mapOperationsReadError(error, 'read Operations checklist items');

    const rows = (data ?? []) as ApiOperationsTemplateItemRow[];
    const items = rows.map(mapItemRow).sort((a, b) => a.sortOrder - b.sortOrder || a.itemId.localeCompare(b.itemId));
    return { status: 'success', data: items };
  } catch (err) {
    return { status: 'unexpected_error', message: err instanceof Error ? err.message : 'Unexpected error reading Operations checklist items.' };
  }
}

export interface CreateOperationsTemplateInput {
  name: string;
  locationId?: string | null;
  category?: string | null;
  description?: string | null;
}

/** Create a template via `api.operations_create_template` (0105). */
export async function createOperationsTemplate(
  supabase: SupabaseClient,
  tenantId: string,
  input: CreateOperationsTemplateInput,
): Promise<OperationsWriteResult<{ templateId: string }>> {
  try {
    const { data, error } = await supabase.schema('api').rpc('operations_create_template', {
      p_tenant_id: tenantId,
      p_name: input.name,
      p_location_id: input.locationId ?? null,
      p_category: input.category ?? null,
      p_description: input.description ?? null,
    });
    if (error) return mapOperationsWriteError(error);
    return { status: 'success', data: { templateId: String(data) } };
  } catch (err) {
    return { status: 'unexpected_error', message: err instanceof Error ? err.message : 'Unexpected error creating this template.' };
  }
}

export interface UpdateOperationsTemplateInput {
  templateId: string;
  name: string;
  category?: string | null;
  description?: string | null;
}

/** Update a template's safe metadata via `api.operations_update_template` (0105) -- never `is_active`/`retired_on`/`location_id`. */
export async function updateOperationsTemplate(
  supabase: SupabaseClient,
  tenantId: string,
  input: UpdateOperationsTemplateInput,
): Promise<OperationsWriteResult<{ templateId: string }>> {
  try {
    const { error } = await supabase.schema('api').rpc('operations_update_template', {
      p_tenant_id: tenantId,
      p_template_id: input.templateId,
      p_name: input.name,
      p_category: input.category ?? null,
      p_description: input.description ?? null,
    });
    if (error) return mapOperationsWriteError(error);
    return { status: 'success', data: { templateId: input.templateId } };
  } catch (err) {
    return { status: 'unexpected_error', message: err instanceof Error ? err.message : 'Unexpected error updating this template.' };
  }
}

/** Atomically retire a template via `api.operations_retire_template` (0105) -- retroactive dates and double-retirement are rejected server-side; the raised error text is surfaced by the caller via `mapOperationsWriteError`. */
export async function retireOperationsTemplate(
  supabase: SupabaseClient,
  tenantId: string,
  templateId: string,
  retiredOn?: string | null,
): Promise<OperationsWriteResult<{ retiredOn: string }>> {
  try {
    const { data, error } = await supabase.schema('api').rpc('operations_retire_template', {
      p_tenant_id: tenantId,
      p_template_id: templateId,
      ...(retiredOn ? { p_retired_on: retiredOn } : {}),
    });
    if (error) return mapOperationsWriteError(error);
    return { status: 'success', data: { retiredOn: String(data) } };
  } catch (err) {
    return { status: 'unexpected_error', message: err instanceof Error ? err.message : 'Unexpected error retiring this template.' };
  }
}

export interface AddOperationsTemplateItemInput {
  templateId: string;
  label: string;
  responseType: OperationsResponseType;
  isCritical?: boolean;
  isRequired?: boolean;
  numericMin?: number | null;
  numericMax?: number | null;
  numericUnit?: string | null;
  sortOrder?: number;
}

/** Add an item to a non-retired template via `api.operations_add_template_item` (0105). */
export async function addOperationsTemplateItem(
  supabase: SupabaseClient,
  tenantId: string,
  input: AddOperationsTemplateItemInput,
): Promise<OperationsWriteResult<{ itemId: string }>> {
  try {
    const { data, error } = await supabase.schema('api').rpc('operations_add_template_item', {
      p_tenant_id: tenantId,
      p_template_id: input.templateId,
      p_label: input.label,
      p_response_type: input.responseType,
      p_is_critical: input.isCritical ?? false,
      p_is_required: input.isRequired ?? true,
      p_numeric_min: input.numericMin ?? null,
      p_numeric_max: input.numericMax ?? null,
      p_numeric_unit: input.numericUnit ?? null,
      p_sort_order: input.sortOrder ?? 0,
    });
    if (error) return mapOperationsWriteError(error);
    return { status: 'success', data: { itemId: String(data) } };
  } catch (err) {
    return { status: 'unexpected_error', message: err instanceof Error ? err.message : 'Unexpected error adding this checklist item.' };
  }
}

export interface UpdateOperationsTemplateItemInput {
  itemId: string;
  label: string;
  isCritical: boolean;
  isRequired: boolean;
  numericMin?: number | null;
  numericMax?: number | null;
  numericUnit?: string | null;
  sortOrder: number;
}

/** Update an item's safe mutable fields via `api.operations_update_template_item` (0105) -- `response_type` is never a parameter here; `is_critical` is rejected server-side once the item is operational (definition-freeze guard) and that error is surfaced as-is, never replicated client-side. */
export async function updateOperationsTemplateItem(
  supabase: SupabaseClient,
  tenantId: string,
  input: UpdateOperationsTemplateItemInput,
): Promise<OperationsWriteResult<{ itemId: string }>> {
  try {
    const { error } = await supabase.schema('api').rpc('operations_update_template_item', {
      p_tenant_id: tenantId,
      p_item_id: input.itemId,
      p_label: input.label,
      p_is_critical: input.isCritical,
      p_is_required: input.isRequired,
      p_numeric_min: input.numericMin ?? null,
      p_numeric_max: input.numericMax ?? null,
      p_numeric_unit: input.numericUnit ?? null,
      p_sort_order: input.sortOrder,
    });
    if (error) return mapOperationsWriteError(error);
    return { status: 'success', data: { itemId: input.itemId } };
  } catch (err) {
    return { status: 'unexpected_error', message: err instanceof Error ? err.message : 'Unexpected error updating this checklist item.' };
  }
}

/** Retire (deactivate) a checklist item via `api.operations_retire_template_item` (0105). */
export async function retireOperationsTemplateItem(
  supabase: SupabaseClient,
  tenantId: string,
  itemId: string,
): Promise<OperationsWriteResult<{ itemId: string }>> {
  try {
    const { error } = await supabase.schema('api').rpc('operations_retire_template_item', { p_tenant_id: tenantId, p_item_id: itemId });
    if (error) return mapOperationsWriteError(error);
    return { status: 'success', data: { itemId } };
  } catch (err) {
    return { status: 'unexpected_error', message: err instanceof Error ? err.message : 'Unexpected error retiring this checklist item.' };
  }
}

export interface ReplaceOperationsTemplateItemInput {
  oldItemId: string;
  label: string;
  responseType: OperationsResponseType;
  isCritical?: boolean;
  isRequired?: boolean;
  numericMin?: number | null;
  numericMax?: number | null;
  numericUnit?: string | null;
  sortOrder?: number | null;
}

/** Retire the old item and create a replacement with a new `responseType` on the same template, via `api.operations_replace_template_item` (0105) -- the sanctioned path once an item is operational and its response type must change. */
export async function replaceOperationsTemplateItem(
  supabase: SupabaseClient,
  tenantId: string,
  input: ReplaceOperationsTemplateItemInput,
): Promise<OperationsWriteResult<{ itemId: string }>> {
  try {
    const { data, error } = await supabase.schema('api').rpc('operations_replace_template_item', {
      p_tenant_id: tenantId,
      p_old_item_id: input.oldItemId,
      p_label: input.label,
      p_response_type: input.responseType,
      p_is_critical: input.isCritical ?? false,
      p_is_required: input.isRequired ?? true,
      p_numeric_min: input.numericMin ?? null,
      p_numeric_max: input.numericMax ?? null,
      p_numeric_unit: input.numericUnit ?? null,
      ...(input.sortOrder !== undefined && input.sortOrder !== null ? { p_sort_order: input.sortOrder } : {}),
    });
    if (error) return mapOperationsWriteError(error);
    return { status: 'success', data: { itemId: String(data) } };
  } catch (err) {
    return { status: 'unexpected_error', message: err instanceof Error ? err.message : 'Unexpected error replacing this checklist item.' };
  }
}
