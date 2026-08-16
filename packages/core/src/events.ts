import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * App-level wrapper around the Event Bus (migration 0073): an append-only
 * cross-module event log. `db` must be a service-role client (same
 * requirement as `notifications.ts`/`audit.ts` -- there is no
 * authenticated-role INSERT grant on `core.events`).
 *
 * This is deliberately just publish + poll-since. No consumer/subscription
 * registry exists yet -- see migration 0073's header for why (zero current
 * producers or consumers to design fan-out delivery tracking against).
 */

export interface PublishEventParams {
  tenantId: string;
  module: string;
  eventType: string;
  payload?: Record<string, unknown>;
}

export interface EventRecord {
  id: number;
  tenantId: string;
  module: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

interface EventRow {
  id: number;
  tenant_id: string;
  module: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

function mapRow(row: EventRow): EventRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    module: row.module,
    eventType: row.event_type,
    payload: row.payload,
    createdAt: row.created_at,
  };
}

/**
 * Publish an event fact. `payload` must hold structured ids only, never
 * rendered PII text (same discipline as `notifications.ts`).
 */
export async function publishEvent(db: SupabaseClient, params: PublishEventParams): Promise<void> {
  const { error } = await db.schema('core').from('events').insert({
    tenant_id: params.tenantId,
    module: params.module,
    event_type: params.eventType,
    payload: params.payload ?? {},
  });
  if (error) throw error;
}

/**
 * Events for a tenant (optionally narrowed to one event type) with id
 * greater than `afterId`, oldest first. For a future consumer to poll using
 * its own read-cursor (the last `id` it processed) -- this table has no
 * per-consumer delivery state of its own.
 */
export async function listEventsSince(
  db: SupabaseClient,
  params: { tenantId: string; eventType?: string; afterId?: number; limit?: number },
): Promise<EventRecord[]> {
  let query = db
    .schema('core')
    .from('events')
    .select('id, tenant_id, module, event_type, payload, created_at')
    .eq('tenant_id', params.tenantId)
    .order('id', { ascending: true })
    .limit(params.limit ?? 100);
  if (params.eventType) query = query.eq('event_type', params.eventType);
  if (params.afterId !== undefined) query = query.gt('id', params.afterId);

  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as EventRow[]).map(mapRow);
}
