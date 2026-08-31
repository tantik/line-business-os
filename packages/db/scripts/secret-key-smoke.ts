/**
 * Supabase Secret API Key — read-only privileged verification ("Phase B smoke").
 *
 * PURPOSE
 * -------
 * Prove, with the smallest possible footprint, that a newly-created Cloud DEV
 * `sb_secret_*` key (`SUPABASE_SECRET_KEY`) is usable as a privileged
 * server-side credential BEFORE the Edge Functions / legacy-key-disable steps
 * of docs/operations/supabase-secret-key-migration-runbook.md.
 *
 * It verifies, in one run:
 *   1. `SUPABASE_SECRET_KEY` is present and shaped like a secret key;
 *   2. a server-side Supabase client can be constructed from it;
 *   3. ONE harmless READ-ONLY privileged call succeeds (Auth Admin
 *      `getUserById` for the all-zero UUID — an authenticated endpoint the
 *      `anon` key cannot reach; the nil UUID returns NO user object);
 *   4. the legacy `SUPABASE_SERVICE_ROLE_KEY` is NOT consulted (this module
 *      never names it — see `secret-key-smoke.test.ts`);
 *   5. nothing is written (no INSERT/UPDATE/DELETE/RPC/migration/seed).
 *
 * HARD SCOPE
 * ----------
 * - Consumes ONLY `SUPABASE_URL` and `SUPABASE_SECRET_KEY`, and ONLY from the
 *   caller-supplied source map (the CLI passes the whole `process.env`; the
 *   member expression `process.env.SUPABASE_SECRET_KEY` is deliberately never
 *   written here — same pattern as `@line-os/config`'s `serverEnv()`).
 * - Never imports `serverEnv()` / `createServiceClient()`; does not weaken them.
 * - `SUPABASE_URL` is pinned to the reviewed Cloud DEV project host so this
 *   verification can never be aimed at production (a different project).
 * - NEVER logs, returns, or embeds either credential, an Authorization header,
 *   or any environment value. Output is a fixed category token plus, at most, a
 *   non-sensitive numeric status.
 * - Fails closed: any missing/invalid input or ambiguous outcome is a
 *   non-OK category and a non-zero exit.
 */

/** Reviewed Cloud DEV project reference (not a secret — it appears in URLs and docs). */
export const CLOUD_DEV_PROJECT_REF = 'pehcoenozjtsjdvjietj';

/** Expected API host for {@link CLOUD_DEV_PROJECT_REF}. */
export const CLOUD_DEV_API_HOST = `${CLOUD_DEV_PROJECT_REF}.supabase.co`;

/** Current Supabase secret-key prefix (`sb_secret_...`). */
const SECRET_KEY_PREFIX = 'sb_secret_';

/** Minimum plausible length for a real secret key (prefix + opaque body). */
const SECRET_KEY_MIN_LENGTH = 20;

/** All-zero UUID: syntactically valid, guaranteed to match no real Auth user. */
export const NIL_UUID = '00000000-0000-0000-0000-000000000000';

/** Only the two variable names this verification is allowed to read. */
export interface SecretKeySmokeEnv {
  SUPABASE_URL?: string;
  SUPABASE_SECRET_KEY?: string;
}

/** Fixed, non-sensitive result category tokens. */
export type SecretKeySmokeCategory =
  | 'SECRET_KEY_SMOKE_OK'
  | 'SMOKE_FAIL_ENV_MISSING'
  | 'SMOKE_FAIL_ENV_INVALID'
  | 'SMOKE_FAIL_KEY_REJECTED'
  | 'SMOKE_FAIL_RATE_LIMITED'
  | 'SMOKE_FAIL_UPSTREAM'
  | 'SMOKE_FAIL_TRANSPORT'
  | 'SMOKE_FAIL_UNKNOWN';

export type ParseSecretKeySmokeEnvResult =
  | { ok: true; url: string; secretKey: string }
  | { ok: false; category: 'SMOKE_FAIL_ENV_MISSING' | 'SMOKE_FAIL_ENV_INVALID'; problems: string[] };

/**
 * Validate the two allowed variables from an arbitrary source map WITHOUT
 * throwing. `problems` lists offending variable NAMES / constraints only — it
 * never contains a value.
 */
export function parseSecretKeySmokeEnv(source: SecretKeySmokeEnv): ParseSecretKeySmokeEnvResult {
  const rawUrl = typeof source.SUPABASE_URL === 'string' ? source.SUPABASE_URL.trim() : '';
  const rawKey = typeof source.SUPABASE_SECRET_KEY === 'string' ? source.SUPABASE_SECRET_KEY.trim() : '';

  const missing: string[] = [];
  if (rawUrl === '') missing.push('SUPABASE_URL');
  if (rawKey === '') missing.push('SUPABASE_SECRET_KEY');
  if (missing.length > 0) {
    return { ok: false, category: 'SMOKE_FAIL_ENV_MISSING', problems: missing };
  }

  const invalid: string[] = [];

  let parsedUrl: URL | null = null;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    parsedUrl = null;
  }
  if (
    parsedUrl === null ||
    parsedUrl.protocol !== 'https:' ||
    parsedUrl.hostname !== CLOUD_DEV_API_HOST ||
    parsedUrl.username !== '' ||
    parsedUrl.password !== '' ||
    parsedUrl.port !== '' ||
    parsedUrl.pathname !== '/' ||
    parsedUrl.search !== '' ||
    parsedUrl.hash !== ''
  ) {
    invalid.push(`SUPABASE_URL (expected exactly https://${CLOUD_DEV_API_HOST})`);
  }

  if (!rawKey.startsWith(SECRET_KEY_PREFIX) || rawKey.length < SECRET_KEY_MIN_LENGTH) {
    invalid.push(`SUPABASE_SECRET_KEY (expected an "${SECRET_KEY_PREFIX}" value)`);
  }

  if (invalid.length > 0) {
    return { ok: false, category: 'SMOKE_FAIL_ENV_INVALID', problems: invalid };
  }

  return { ok: true, url: rawUrl, secretKey: rawKey };
}

/** Outcome of the single privileged read probe. Carries NO row data. */
export interface SecretKeySmokeProbeOutcome {
  /** Numeric status observed from the Auth Admin response, or null if none. */
  status: number | null;
  /** True when the transport itself threw (DNS/network/TLS). */
  threw: boolean;
}

/**
 * Minimal, fully-injectable client surface: one read-only privileged probe.
 * Tests supply a fake; only the default builder touches `@supabase/supabase-js`.
 */
export interface SecretKeySmokeProbeClient {
  probePrivilegedRead(): Promise<SecretKeySmokeProbeOutcome>;
}

export interface SecretKeySmokeDeps {
  /** Source map for the two allowed variables (defaults to `process.env`). */
  env?: SecretKeySmokeEnv;
  /** Builds the probe client (defaults to a real `@supabase/supabase-js` client). */
  buildClient?: (url: string, secretKey: string) => Promise<SecretKeySmokeProbeClient>;
}

export interface SecretKeySmokeResult {
  category: SecretKeySmokeCategory;
  /** Non-sensitive detail only (e.g. `status=404`, or offending variable names). */
  detail?: string;
}

/** Map a probe outcome to a fixed category. Ambiguity always fails closed. */
export function classifyProbeOutcome(outcome: SecretKeySmokeProbeOutcome): SecretKeySmokeResult {
  if (outcome.threw) return { category: 'SMOKE_FAIL_TRANSPORT' };
  const { status } = outcome;
  if (status === null) return { category: 'SMOKE_FAIL_UNKNOWN' };
  // 200 (unlikely for the nil UUID) or 404 (expected): the privileged endpoint
  // accepted the key and answered. Either way the key works and no user was
  // returned.
  if (status === 200 || status === 404) {
    return { category: 'SECRET_KEY_SMOKE_OK', detail: `status=${status}` };
  }
  if (status === 401 || status === 403) {
    return { category: 'SMOKE_FAIL_KEY_REJECTED', detail: `status=${status}` };
  }
  if (status === 429) return { category: 'SMOKE_FAIL_RATE_LIMITED', detail: `status=${status}` };
  if (status >= 500) return { category: 'SMOKE_FAIL_UPSTREAM', detail: `status=${status}` };
  return { category: 'SMOKE_FAIL_UNKNOWN', detail: `status=${status}` };
}

/**
 * Run the verification. Never throws for an expected failure — always resolves
 * to a category. The default `env` is `process.env`; the CLI passes it
 * explicitly so this module never contains a `process.env.<NAME>` member read.
 */
export async function runSecretKeySmoke(deps: SecretKeySmokeDeps = {}): Promise<SecretKeySmokeResult> {
  const env = deps.env ?? process.env;
  const parsed = parseSecretKeySmokeEnv(env);
  if (!parsed.ok) {
    return { category: parsed.category, detail: parsed.problems.join('; ') };
  }

  const build = deps.buildClient ?? defaultBuildSecretKeySmokeClient;

  let client: SecretKeySmokeProbeClient;
  try {
    client = await build(parsed.url, parsed.secretKey);
  } catch {
    return { category: 'SMOKE_FAIL_TRANSPORT', detail: 'client construction failed' };
  }

  let outcome: SecretKeySmokeProbeOutcome;
  try {
    outcome = await client.probePrivilegedRead();
  } catch {
    return { category: 'SMOKE_FAIL_TRANSPORT', detail: 'probe threw' };
  }

  return classifyProbeOutcome(outcome);
}

/**
 * Default probe client: a lazily-imported `@supabase/supabase-js` client that
 * performs ONE Auth Admin `getUserById(NIL_UUID)` — a read-only, privileged-
 * only call. By the GoTrue endpoint contract the all-zero UUID resolves to no
 * user (HTTP 404), so no row is returned; this module additionally never reads
 * the response body, an error message, or a header — only a numeric status.
 */
export async function defaultBuildSecretKeySmokeClient(
  url: string,
  secretKey: string,
): Promise<SecretKeySmokeProbeClient> {
  const { createClient } = await import('@supabase/supabase-js');
  const client = createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return {
    probePrivilegedRead: async () => {
      try {
        const { error } = await client.auth.admin.getUserById(NIL_UUID);
        if (!error) return { status: 200, threw: false };
        const status = typeof error.status === 'number' ? error.status : null;
        return { status, threw: false };
      } catch {
        return { status: null, threw: true };
      }
    },
  };
}
