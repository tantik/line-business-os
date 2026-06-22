import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuditEntry } from '@line-os/db/types';

/**
 * Write an audit log entry. Call this from the backend after every mutating
 * action. `db` must be a service-role client (inserts bypass the read-only RLS
 * on audit.audit_logs).
 *
 * Do NOT pass raw PII in before/after — redact at the call site.
 */
export async function writeAudit(db: SupabaseClient, entry: AuditEntry): Promise<void> {
  const { error } = await db.schema('audit').from('audit_logs').insert({
    tenant_id: entry.tenantId,
    actor_id: entry.actorId ?? null,
    actor_kind: entry.actorKind ?? 'user',
    module: entry.module,
    entity: entry.entity,
    entity_id: entry.entityId ?? null,
    action: entry.action,
    before: entry.before ?? null,
    after: entry.after ?? null,
    metadata: entry.metadata ?? {},
  });
  if (error) throw error;
}

/**
 * Redact known PII-ish keys from an object before logging. Defense-in-depth;
 * prefer logging ids and non-PII fields explicitly.
 */
export function redactPII<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const PII_KEYS = /(email|phone|address|name|line_user_id|password|secret|token)/i;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = PII_KEYS.test(k) ? '[redacted]' : v;
  }
  return out as Partial<T>;
}
