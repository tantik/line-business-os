import type { SupabaseClient } from '@supabase/supabase-js';
import type { TenantAccessResult } from '@/lib/tenant/types';
import type { InventoryWriteResult } from './result-types';
import { mapInventoryReadError, mapInventoryWriteError } from './pg-error';

export type InventoryCheckType = 'opening' | 'closing';
export type InventoryCheckStatus = 'in_progress' | 'completed' | 'cancelled';

interface SessionRow {
  session_id: string;
  tenant_id: string;
  location_id: string;
  business_date: string;
  check_type: InventoryCheckType;
  status: InventoryCheckStatus;
  started_at: string;
  completed_at: string | null;
  item_count: number;
  counted_item_count: number;
}

interface SessionItemRow {
  session_item_id: string;
  tenant_id: string;
  location_id: string;
  session_id: string;
  item_id: string;
  item_name: string;
  unit: string;
  required_quantity: number | string;
  reorder_point: number | string;
  actual_quantity: number | string | null;
  shortage_quantity: number | string | null;
  counted_at: string | null;
}

export interface InventoryCheckSession {
  sessionId: string;
  tenantId: string;
  locationId: string;
  businessDate: string;
  checkType: InventoryCheckType;
  status: InventoryCheckStatus;
  startedAt: string;
  completedAt: string | null;
  itemCount: number;
  countedItemCount: number;
}

export interface InventoryCheckSessionItem {
  sessionItemId: string;
  sessionId: string;
  itemId: string;
  itemName: string;
  unit: string;
  requiredQuantity: number;
  reorderPoint: number;
  actualQuantity: number | null;
  shortageQuantity: number | null;
  countedAt: string | null;
}

export async function listInventoryCheckSessions(
  supabase: SupabaseClient,
  tenantId: string,
  locationId: string,
  businessDate?: string,
): Promise<TenantAccessResult<InventoryCheckSession[]>> {
  try {
    let query = supabase
      .schema('api')
      .from('inventory_check_sessions')
      .select('session_id, tenant_id, location_id, business_date, check_type, status, started_at, completed_at, item_count, counted_item_count')
      .eq('tenant_id', tenantId)
      .eq('location_id', locationId)
      .order('business_date', { ascending: false });
    if (businessDate) query = query.eq('business_date', businessDate);
    const { data, error } = await query;
    if (error) return mapInventoryReadError(error, 'read inventory check sessions');
    return {
      status: 'success',
      data: ((data ?? []) as SessionRow[]).map((row) => ({
        sessionId: row.session_id,
        tenantId: row.tenant_id,
        locationId: row.location_id,
        businessDate: row.business_date,
        checkType: row.check_type,
        status: row.status,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        itemCount: Number(row.item_count),
        countedItemCount: Number(row.counted_item_count),
      })),
    };
  } catch (error) {
    return { status: 'unexpected_error', message: error instanceof Error ? error.message : 'Unable to read inventory sessions.' };
  }
}

export async function listInventoryCheckSessionItems(
  supabase: SupabaseClient,
  tenantId: string,
  sessionId: string,
): Promise<TenantAccessResult<InventoryCheckSessionItem[]>> {
  try {
    const { data, error } = await supabase
      .schema('api')
      .from('inventory_check_session_items')
      .select('session_item_id, tenant_id, location_id, session_id, item_id, item_name, unit, required_quantity, reorder_point, actual_quantity, shortage_quantity, counted_at')
      .eq('tenant_id', tenantId)
      .eq('session_id', sessionId)
      .order('item_name');
    if (error) return mapInventoryReadError(error, 'read inventory check items');
    return {
      status: 'success',
      data: ((data ?? []) as SessionItemRow[]).map((row) => ({
        sessionItemId: row.session_item_id,
        sessionId: row.session_id,
        itemId: row.item_id,
        itemName: row.item_name,
        unit: row.unit,
        requiredQuantity: Number(row.required_quantity),
        reorderPoint: Number(row.reorder_point),
        actualQuantity: row.actual_quantity === null ? null : Number(row.actual_quantity),
        shortageQuantity: row.shortage_quantity === null ? null : Number(row.shortage_quantity),
        countedAt: row.counted_at,
      })),
    };
  } catch (error) {
    return { status: 'unexpected_error', message: error instanceof Error ? error.message : 'Unable to read inventory session items.' };
  }
}

async function rpc(
  supabase: SupabaseClient,
  name: 'start_inventory_check_session' | 'record_inventory_session_item' | 'complete_inventory_check_session',
  args: Record<string, string | number>,
): Promise<InventoryWriteResult<{ id: string }>> {
  try {
    const { data, error } = await supabase.schema('api').rpc(name, args);
    if (error) return mapInventoryWriteError(error, 'update inventory check');
    const row = Array.isArray(data) ? data[0] : data;
    const value = typeof row === 'string' ? row : row && typeof row === 'object' ? row.session_id ?? row.complete_inventory_check_session : data;
    return { status: 'success', data: { id: String(value ?? '') } };
  } catch (error) {
    return { status: 'unexpected_error', message: error instanceof Error ? error.message : 'Unable to update inventory check.' };
  }
}

export function startInventoryCheckSession(
  supabase: SupabaseClient,
  tenantId: string,
  locationId: string,
  businessDate: string,
  checkType: InventoryCheckType,
) {
  return rpc(supabase, 'start_inventory_check_session', {
    p_tenant_id: tenantId,
    p_location_id: locationId,
    p_business_date: businessDate,
    p_check_type: checkType,
  });
}

export function recordInventorySessionItem(
  supabase: SupabaseClient,
  sessionId: string,
  itemId: string,
  actualQuantity: number,
) {
  return rpc(supabase, 'record_inventory_session_item', {
    p_session_id: sessionId,
    p_item_id: itemId,
    p_actual_quantity: actualQuantity,
  });
}

export function completeInventoryCheckSession(supabase: SupabaseClient, sessionId: string) {
  return rpc(supabase, 'complete_inventory_check_session', { p_session_id: sessionId });
}
