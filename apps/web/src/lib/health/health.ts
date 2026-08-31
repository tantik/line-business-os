import { readPublicSupabaseEnv, type ReadPublicSupabaseEnvResult } from '../supabase/env';

/**
 * Health-check report builder for the public `GET /api/health` endpoint.
 *
 * SECURITY / SCOPE:
 * - Framework-light: no `next/headers`, no `server-only`, no auth session, no
 *   tenant queries, no DB writes. The route handler is the only server glue.
 * - Uses ONLY the browser-safe public Supabase config (anon key + URL) via
 *   `readPublicSupabaseEnv()`. It never reads the server-only privileged key,
 *   never constructs a privileged DB client, and never bypasses RLS. (The
 *   privileged-key/client tokens are deliberately omitted here so this file
 *   passes the source guardrails.)
 * - The report intentionally exposes coarse dependency NAMES + states only. It
 *   never serializes the Supabase URL, anon key, DB URL, JWTs, refresh tokens,
 *   user/tenant ids, raw response bodies, raw errors, stack traces, or the app
 *   version / commit SHA.
 */

export type ConfigCheck = 'ok' | 'missing';
export type SupabaseCheck = 'ok' | 'unreachable' | 'skipped';
export type HealthStatus = 'ok' | 'degraded' | 'unhealthy';

export interface HealthChecks {
  app: 'ok';
  config: ConfigCheck;
  supabase: SupabaseCheck;
}

export interface HealthReport {
  status: HealthStatus;
  timestamp: string;
  checks: HealthChecks;
}

export interface HealthResult {
  report: HealthReport;
  httpStatus: 200 | 503;
}

/** Short probe timeout so the endpoint never hangs on a Supabase blip. */
const DEFAULT_PROBE_TIMEOUT_MS = 2500;

/**
 * Map a health status to its HTTP code:
 * - `ok` / `degraded` -> 200 (degraded is reserved for optional future deps).
 * - `unhealthy`       -> 503 (core config or Supabase/Auth health unavailable).
 */
export function httpStatusForHealth(status: HealthStatus): 200 | 503 {
  return status === 'unhealthy' ? 503 : 200;
}

/**
 * Derive overall status from the individual checks. Missing public config or an
 * unreachable Supabase/Auth health probe are hard failures (`unhealthy`).
 * `degraded` is intentionally NOT produced by core checks; it is reserved for
 * optional future dependencies.
 */
export function deriveHealthStatus(checks: HealthChecks): HealthStatus {
  if (checks.config === 'missing' || checks.supabase === 'unreachable') return 'unhealthy';
  return 'ok';
}

/**
 * Read-only Supabase Auth health probe: `GET <url>/auth/v1/health`.
 *
 * - Unauthenticated, no tenant data, no RLS-protected rows; touches nothing
 *   product-related. Sends only the public low-privilege key (publishable or
 *   legacy anon) as the `apikey` header (some Supabase deployments require it
 *   on Auth endpoints).
 * - Short timeout via `AbortController`. Any non-2xx, timeout, or thrown error
 *   maps to `'unreachable'`. The raw response body and raw error are never
 *   returned or serialized.
 */
export async function probeSupabaseAuthHealth(
  url: string,
  apiKey: string,
  options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<SupabaseCheck> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS;
  if (typeof fetchImpl !== 'function') return 'unreachable';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const endpoint = `${url.replace(/\/+$/, '')}/auth/v1/health`;
    const res = await fetchImpl(endpoint, {
      method: 'GET',
      headers: { apikey: apiKey },
      signal: controller.signal,
    });
    return res.ok ? 'ok' : 'unreachable';
  } catch {
    // Swallow intentionally: never serialize a raw probe error to the client.
    return 'unreachable';
  } finally {
    clearTimeout(timer);
  }
}

export interface HealthReportDeps {
  /** Injectable for tests; defaults to the real public env reader. */
  readEnv?: () => ReadPublicSupabaseEnvResult;
  /** Injectable for tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Injectable clock for deterministic tests. */
  now?: () => Date;
}

/**
 * Build the full health result (report + HTTP status). The route handler calls
 * this with no args in production; tests inject stubs for env/fetch/clock.
 *
 * If public config is missing we cannot run the probe (no URL/key), so the
 * Supabase check is reported as `'skipped'` and overall status is `unhealthy`
 * (driven by the missing config).
 */
export async function getHealthReport(deps: HealthReportDeps = {}): Promise<HealthResult> {
  const readEnv = deps.readEnv ?? readPublicSupabaseEnv;
  const now = deps.now ?? (() => new Date());

  const env = readEnv();
  let config: ConfigCheck;
  let supabase: SupabaseCheck;

  if (!env.ok) {
    config = 'missing';
    supabase = 'skipped';
  } else {
    config = 'ok';
    supabase = await probeSupabaseAuthHealth(env.config.url, env.config.key, {
      fetchImpl: deps.fetchImpl,
      timeoutMs: deps.timeoutMs,
    });
  }

  const checks: HealthChecks = { app: 'ok', config, supabase };
  const status = deriveHealthStatus(checks);
  return {
    report: { status, timestamp: now().toISOString(), checks },
    httpStatus: httpStatusForHealth(status),
  };
}
