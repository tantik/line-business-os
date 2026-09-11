import type { TenantAccessResult } from '@/lib/tenant/types';

/**
 * Shared discriminated result shape for every Issues & Handover write helper
 * (Cafe v2.2 WP2, Manager frontend slice). Extends `TenantAccessResult` with
 * one write-specific outcome: every `api.issues_*` RPC (0118) fails closed by
 * raising a distinguishable, stable exception message on business-rule
 * violations (module OFF, permission denied, not found, invalid kind/
 * category/severity, already resolved, etc) rather than returning a generic
 * Postgres error -- `mapIssuesWriteError` (`pg-error.ts`) turns any such
 * message into `{ status: 'issues_error'; code }`, and the UI layer
 * (`error-copy.ts`) maps `code` to bilingual (JA/EN) copy. Mirrors
 * `@/lib/operations/result-types.ts` exactly.
 */
export type IssuesWriteResult<T> = TenantAccessResult<T> | { status: 'issues_error'; code: string };
