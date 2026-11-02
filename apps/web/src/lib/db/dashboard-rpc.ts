import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import type { TenantAccessResult } from '@/lib/tenant/types';
import { readPiiEnv } from '@/lib/workforce/pii-env';

/**
 * Shared loader of the page "dashboard" RPCs (`api.manager_dashboard` 0144,
 * `api.staff_dashboard` 0145, DEBT-135): one RPC returns
 *   { "<part>": {"rows": [...]} | {"error": {"code", "message"}}, ... }
 * and each part is mapped by the row mapper and error mapper of the lib
 * function it replaces, so it ends up as exactly that function's
 * `TenantAccessResult`.
 */

export interface PartPayload {
  rows: unknown[];
  protectedHistoryIds?: unknown;
}

export interface MapContext {
  tenantId: string;
  encryptionKey: string;
}

export interface PartSpec<T> {
  error: (error: PostgrestError) => TenantAccessResult<never>;
  map: (payload: PartPayload, ctx: MapContext) => TenantAccessResult<T>;
  /** The lib function checked the PII env before reading; a missing env is that part's `config_error`. */
  needsPii?: boolean;
}

export function rows<T>(payload: PartPayload): T[] {
  return payload.rows as T[];
}

export function ok<T>(data: T): TenantAccessResult<T> {
  return { status: 'success', data };
}

export function spec<T>(error: PartSpec<T>['error'], map: PartSpec<T>['map'], options: { needsPii?: boolean } = {}): PartSpec<T> {
  return { error, map, ...options };
}

export type PartSpecs = Record<string, PartSpec<unknown>>;
export type DashboardResults<S extends PartSpecs> = { [K in keyof S]: ReturnType<S[K]['map']> };

function toPostgrestError(value: unknown): PostgrestError {
  const e = (value && typeof value === 'object' ? value : {}) as { code?: unknown; message?: unknown };
  return {
    name: 'PostgrestError',
    code: typeof e.code === 'string' ? e.code : '',
    message: typeof e.message === 'string' ? e.message : 'Unexpected error.',
    details: '',
    hint: '',
  } as PostgrestError;
}

/**
 * Calls `api.<fn>` once for `params.parts`. Fails closed: an RPC error maps
 * to each requested part's own error result (as if its single read had
 * failed with that error); a throw or an unexpected payload becomes
 * `unexpected_error` for every requested part. Parts not requested come back
 * as `unexpected_error` ("not requested").
 */
export async function loadDashboardRpc<S extends PartSpecs>(
  supabase: SupabaseClient,
  fn: string,
  label: string,
  specs: S,
  tenantId: string,
  locationId: string,
  params: { parts: readonly (keyof S & string)[] } & Record<string, unknown>,
): Promise<DashboardResults<S>> {
  const names = Object.keys(specs) as (keyof S & string)[];
  // `part` always comes from `names`, i.e. a key of `specs`.
  const specOf = (part: keyof S & string) => specs[part] as PartSpec<unknown>;
  const requested = new Set(params.parts);
  const pii = readPiiEnv();
  const piiConfigError: TenantAccessResult<never> | null = pii.ok
    ? null
    : { status: 'config_error', message: `Missing PII protection env: ${pii.missing.join(', ')}` };
  const ctx: MapContext = { tenantId, encryptionKey: pii.ok ? pii.config.encryptionKey : '' };
  const notRequested = { status: 'unexpected_error', message: `Not requested in this ${label} load.` } as const;
  const badShape = `Unexpected ${label} response.`;

  const finish = (fill: (part: keyof S & string) => TenantAccessResult<unknown>): DashboardResults<S> =>
    Object.fromEntries(
      names.map((part) => {
        if (!requested.has(part)) return [part, notRequested];
        if (specOf(part).needsPii && piiConfigError) return [part, piiConfigError];
        return [part, fill(part)];
      }),
    ) as DashboardResults<S>;

  try {
    const { data, error } = await supabase.schema('api').rpc(fn, {
      p_tenant_id: tenantId,
      p_location_id: locationId,
      p_params: { ...params, parts: [...requested] },
    });
    if (error) return finish((part) => specOf(part).error(error));
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return finish(() => ({ status: 'unexpected_error', message: badShape }));
    }
    const bundle = data as Record<string, unknown>;
    return finish((part) => {
      const value = bundle[part] as { rows?: unknown; error?: unknown; protectedHistoryIds?: unknown } | undefined;
      if (value && typeof value === 'object' && 'error' in value) return specOf(part).error(toPostgrestError(value.error));
      if (!value || typeof value !== 'object' || !Array.isArray(value.rows)) return { status: 'unexpected_error', message: badShape };
      try {
        return specOf(part).map({ rows: value.rows, protectedHistoryIds: value.protectedHistoryIds }, ctx);
      } catch (err) {
        return { status: 'unexpected_error', message: err instanceof Error ? err.message : badShape };
      }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : `Unexpected error reading the ${label}.`;
    return finish(() => ({ status: 'unexpected_error', message }));
  }
}
