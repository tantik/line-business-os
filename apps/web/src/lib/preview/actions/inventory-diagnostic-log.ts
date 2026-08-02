/**
 * TEMPORARY diagnostic logging for the Preview Manager Inventory
 * "no permission" investigation. Not a permanent logging utility -- remove
 * once the divergence point between a DB-confirmed core.has_permission=true
 * and the UI's "no_access" message is located.
 *
 * Gated to non-production (dev/preview) only. Logs no PII: only ids,
 * permission keys, status strings, and raw PostgREST/Postgrest error
 * metadata (code/message/details/hint/status), none of which carry
 * customer/employee personal data.
 */
export function invDiagLog(stage: string, detail: Record<string, unknown>): void {
  if (process.env.NODE_ENV === 'production') return;
  console.warn('[INV-DIAG]', stage, JSON.stringify(detail));
}
