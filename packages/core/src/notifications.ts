import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * App-level wrapper around the Notifications engine (migration 0072): a
 * generic cross-module outbox. `db` must be a service-role client (same
 * requirement as `audit.ts`'s `writeAudit` -- there is no authenticated-role
 * write grant on `core.notifications`, notifications are system-generated
 * only).
 *
 * This module intentionally stops at enqueue/status-transition helpers. It
 * does NOT send anything -- no dispatch worker exists yet. See migration
 * 0072's header for why: actually delivering a LINE message is a distinct,
 * later, explicitly-approved step (CLAUDE.md's LINE broadcast/mass
 * messaging safety boundary), separate from building this engine.
 */

export interface EnqueueNotificationParams {
  tenantId: string;
  module: string;
  recipientLineAccountId: string;
  idempotencyKey: string;
  templateKey: string;
  templateParams?: Record<string, unknown>;
}

export interface NotificationRecord {
  id: string;
  tenantId: string;
  module: string;
  channel: string;
  status: string;
  attemptCount: number;
  templateKey: string;
  templateParams: Record<string, unknown>;
}

interface NotificationRow {
  id: string;
  tenant_id: string;
  module: string;
  channel: string;
  status: string;
  attempt_count: number;
  template_key: string;
  template_params: Record<string, unknown>;
}

function mapRow(row: NotificationRow): NotificationRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    module: row.module,
    channel: row.channel,
    status: row.status,
    attemptCount: row.attempt_count,
    templateKey: row.template_key,
    templateParams: row.template_params,
  };
}

/**
 * Enqueue a notification (status `pending`). Idempotent on
 * `(tenant_id, module, idempotency_key)` -- a repeat call with the same key
 * is a no-op, not a duplicate row. `templateParams` must hold structured ids
 * only, never rendered PII text (resolve display content at dispatch time).
 */
export async function enqueueNotification(
  db: SupabaseClient,
  params: EnqueueNotificationParams,
): Promise<void> {
  const { error } = await db
    .schema('core')
    .from('notifications')
    .upsert(
      {
        tenant_id: params.tenantId,
        module: params.module,
        recipient_line_account_id: params.recipientLineAccountId,
        idempotency_key: params.idempotencyKey,
        template_key: params.templateKey,
        template_params: params.templateParams ?? {},
      },
      { onConflict: 'tenant_id,module,idempotency_key', ignoreDuplicates: true },
    );
  if (error) throw error;
}

/** Pending notifications for a channel, oldest first. For a future dispatch worker. */
export async function listPendingNotifications(
  db: SupabaseClient,
  params: { channel: string; limit?: number },
): Promise<NotificationRecord[]> {
  const { data, error } = await db
    .schema('core')
    .from('notifications')
    .select('id, tenant_id, module, channel, status, attempt_count, template_key, template_params')
    .eq('channel', params.channel)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(params.limit ?? 50);
  if (error) throw error;
  return ((data ?? []) as NotificationRow[]).map(mapRow);
}

/** Mark a notification `sent`. For a future dispatch worker. */
export async function markNotificationSent(db: SupabaseClient, id: string): Promise<void> {
  const { error } = await db
    .schema('core')
    .from('notifications')
    .update({ status: 'sent', sent_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

/**
 * Mark a notification `failed`, record the error, and increment
 * `attempt_count`. For a future dispatch worker.
 */
export async function markNotificationFailed(
  db: SupabaseClient,
  id: string,
  errorMessage: string,
): Promise<void> {
  const { data: current, error: readError } = await db
    .schema('core')
    .from('notifications')
    .select('attempt_count')
    .eq('id', id)
    .single();
  if (readError) throw readError;

  const { error } = await db
    .schema('core')
    .from('notifications')
    .update({
      status: 'failed',
      last_error: errorMessage,
      attempt_count: (current as { attempt_count: number }).attempt_count + 1,
    })
    .eq('id', id);
  if (error) throw error;
}
