import type { TenantAccessResult } from '@/lib/tenant/types';

/**
 * Shared discriminated result shape for every Operations Configuration write
 * helper in this slice. Extends `TenantAccessResult` with one write-specific
 * outcome: every `api.operations_*` configuration RPC (0105) fails closed by
 * raising a distinguishable, stable exception message on business-rule
 * violations (module OFF, permission denied, not found, already retired,
 * retroactive date, frozen-after-operational, etc) rather than returning a
 * generic Postgres error -- `mapOperationsWriteError` (`pg-error.ts`) turns
 * any such message into `{ status: 'operations_error', code }`, and the UI
 * layer (`error-copy.ts`) maps `code` to bilingual (JA/EN) copy. A code with
 * no dedicated copy still renders a generic bilingual fallback, never the
 * raw machine identifier.
 */
export type OperationsWriteResult<T> = TenantAccessResult<T> | { status: 'operations_error'; code: string };
