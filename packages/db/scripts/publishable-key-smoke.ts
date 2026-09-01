/**
 * Supabase Publishable API Key — read-only, unauthenticated verification
 * ("Phase 4C smoke", docs/operations/supabase-secret-key-migration-runbook.md).
 *
 * PURPOSE
 * -------
 * Prove, with the smallest possible footprint, that the repo-root operator
 * `SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_*`) is accepted by the Cloud DEV
 * API gateway ON ITS OWN — with NO legacy `anon` fallback available — BEFORE the
 * legacy-key-disable step (runbook §7).
 *
 * It verifies, in one run:
 *   1. `SUPABASE_PUBLISHABLE_KEY` is present and shaped like a publishable key;
 *   2. `SUPABASE_URL` is exactly the reviewed Cloud DEV project host;
 *   3. ONE harmless READ-ONLY, UNAUTHENTICATED request is accepted by the
 *      Supabase API gateway as a valid project API key:
 *      `GET {url}/rest/v1/<a deliberately non-existent relation>` sent with only
 *      the `apikey` header. The Supabase gateway (Kong `key-auth`) requires a
 *      valid project API key for every `/rest/v1/*` route and answers `401`
 *      BEFORE PostgREST when the key is missing/invalid; a VALID publishable
 *      key reaches PostgREST, which then answers `404` (schema-cache miss) for
 *      the non-existent relation. `404` (gateway passed) vs `401` (gateway
 *      rejected) is therefore a reliable, RLS-/GRANT-independent discriminator
 *      that does not depend on any table being anon-selectable.
 *   4. the legacy `SUPABASE_ANON_KEY` is NOT consulted (this module never names
 *      it — see `publishable-key-smoke.test.ts`);
 *   5. nothing is written, no user signs in, no privileged/secret key is used,
 *      no PII is read.
 *
 * HARD SCOPE
 * ----------
 * - Consumes ONLY `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`, and ONLY from
 *   the caller-supplied source map (the CLI passes the whole `process.env`; the
 *   member expression `process.env.SUPABASE_PUBLISHABLE_KEY` is deliberately
 *   never written here — same pattern as `@line-os/config`'s `serverEnv()` and
 *   the sibling `secret-key-smoke.ts`).
 * - Never imports `serverEnv()` / `createUserClient()` / `createServiceClient()`;
 *   does not weaken them. No `@supabase/supabase-js` client is built — the probe
 *   is a single bare `fetch` with one header.
 * - `SUPABASE_URL` is pinned to the reviewed Cloud DEV project host so this
 *   verification can never be aimed at production (a different project).
 * - NEVER logs, returns, or embeds the key, the `apikey` header, an
 *   Authorization header, a cookie, a response body, or any environment value.
 *   Output is a fixed category token plus, at most, a non-sensitive numeric
 *   status.
 * - Fails closed: any missing/invalid input or ambiguous outcome is a non-OK
 *   category and a non-zero exit.
 */

/** Reviewed Cloud DEV project reference (not a secret — it appears in URLs and docs). */
export const CLOUD_DEV_PROJECT_REF = 'pehcoenozjtsjdvjietj';

/** Expected API host for {@link CLOUD_DEV_PROJECT_REF}. */
export const CLOUD_DEV_API_HOST = `${CLOUD_DEV_PROJECT_REF}.supabase.co`;

/** Current Supabase publishable-key prefix (`sb_publishable_...`). */
const PUBLISHABLE_KEY_PREFIX = 'sb_publishable_';

/** Minimum plausible length for a real publishable key (prefix + opaque body). */
const PUBLISHABLE_KEY_MIN_LENGTH = 20;

/**
 * A relation name that is guaranteed not to exist in any exposed schema. The
 * probe requests it so a VALID key produces PostgREST's `404` schema-cache miss
 * (proving the gateway passed the request through) while an INVALID/missing key
 * is stopped at the gateway with `401`. A `GET` on a non-existent relation
 * writes nothing and returns no rows.
 */
export const NONEXISTENT_PROBE_RELATION = 'publishable_key_smoke_probe_nonexistent';

/** Only the two variable names this verification is allowed to read. */
export interface PublishableKeySmokeEnv {
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
}

/** Fixed, non-sensitive result category tokens. */
export type PublishableKeySmokeCategory =
  | 'PUBLISHABLE_KEY_SMOKE_OK'
  | 'SMOKE_FAIL_ENV_MISSING'
  | 'SMOKE_FAIL_ENV_INVALID'
  | 'SMOKE_FAIL_KEY_REJECTED'
  | 'SMOKE_FAIL_RATE_LIMITED'
  | 'SMOKE_FAIL_UPSTREAM'
  | 'SMOKE_FAIL_TRANSPORT'
  | 'SMOKE_FAIL_UNKNOWN';

export type ParsePublishableKeySmokeEnvResult =
  | { ok: true; url: string; publishableKey: string }
  | { ok: false; category: 'SMOKE_FAIL_ENV_MISSING' | 'SMOKE_FAIL_ENV_INVALID'; problems: string[] };

/**
 * Validate the two allowed variables from an arbitrary source map WITHOUT
 * throwing. `problems` lists offending variable NAMES / constraints only — it
 * never contains a value.
 */
export function parsePublishableKeySmokeEnv(
  source: PublishableKeySmokeEnv,
): ParsePublishableKeySmokeEnvResult {
  const rawUrl = typeof source.SUPABASE_URL === 'string' ? source.SUPABASE_URL.trim() : '';
  const rawKey =
    typeof source.SUPABASE_PUBLISHABLE_KEY === 'string' ? source.SUPABASE_PUBLISHABLE_KEY.trim() : '';

  const missing: string[] = [];
  if (rawUrl === '') missing.push('SUPABASE_URL');
  if (rawKey === '') missing.push('SUPABASE_PUBLISHABLE_KEY');
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

  if (!rawKey.startsWith(PUBLISHABLE_KEY_PREFIX) || rawKey.length < PUBLISHABLE_KEY_MIN_LENGTH) {
    invalid.push(`SUPABASE_PUBLISHABLE_KEY (expected an "${PUBLISHABLE_KEY_PREFIX}" value)`);
  }

  if (invalid.length > 0) {
    return { ok: false, category: 'SMOKE_FAIL_ENV_INVALID', problems: invalid };
  }

  return { ok: true, url: rawUrl, publishableKey: rawKey };
}

/** Outcome of the single unauthenticated read probe. Carries NO body data. */
export interface PublishableKeySmokeProbeOutcome {
  /** Numeric HTTP status observed from the gateway/PostgREST, or null if none. */
  status: number | null;
  /** True when the transport itself threw (DNS/network/TLS). */
  threw: boolean;
}

/**
 * Minimal, fully-injectable probe surface: one read-only unauthenticated
 * request. Tests supply a fake; only the default builder touches the network.
 */
export interface PublishableKeySmokeProbe {
  probeGatewayAcceptsKey(): Promise<PublishableKeySmokeProbeOutcome>;
}

export interface PublishableKeySmokeDeps {
  /** Source map for the two allowed variables (defaults to `process.env`). */
  env?: PublishableKeySmokeEnv;
  /** Builds the probe (defaults to a real bare-`fetch` probe). */
  buildProbe?: (url: string, publishableKey: string) => Promise<PublishableKeySmokeProbe>;
}

export interface PublishableKeySmokeResult {
  category: PublishableKeySmokeCategory;
  /** Non-sensitive detail only (e.g. `status=404`, or offending variable names). */
  detail?: string;
}

/** Map a probe outcome to a fixed category. Ambiguity always fails closed. */
export function classifyProbeOutcome(
  outcome: PublishableKeySmokeProbeOutcome,
): PublishableKeySmokeResult {
  if (outcome.threw) return { category: 'SMOKE_FAIL_TRANSPORT' };
  const { status } = outcome;
  if (status === null) return { category: 'SMOKE_FAIL_UNKNOWN' };
  // 404 (expected: the non-existent relation, PostgREST reached) or a 2xx: the
  // gateway accepted the publishable key as a valid project API key and passed
  // the request through. No relation was read; no rows exist to return.
  if (status === 404 || (status >= 200 && status < 300)) {
    return { category: 'PUBLISHABLE_KEY_SMOKE_OK', detail: `status=${status}` };
  }
  // 401 (no/invalid API key at the gateway) or 403: the key was NOT accepted.
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
export async function runPublishableKeySmoke(
  deps: PublishableKeySmokeDeps = {},
): Promise<PublishableKeySmokeResult> {
  const env = deps.env ?? process.env;
  const parsed = parsePublishableKeySmokeEnv(env);
  if (!parsed.ok) {
    return { category: parsed.category, detail: parsed.problems.join('; ') };
  }

  const build = deps.buildProbe ?? defaultBuildPublishableKeySmokeProbe;

  let probe: PublishableKeySmokeProbe;
  try {
    probe = await build(parsed.url, parsed.publishableKey);
  } catch {
    return { category: 'SMOKE_FAIL_TRANSPORT', detail: 'probe construction failed' };
  }

  let outcome: PublishableKeySmokeProbeOutcome;
  try {
    outcome = await probe.probeGatewayAcceptsKey();
  } catch {
    return { category: 'SMOKE_FAIL_TRANSPORT', detail: 'probe threw' };
  }

  return classifyProbeOutcome(outcome);
}

/**
 * Default probe: ONE bare `fetch` — `GET {url}/rest/v1/<non-existent relation>`
 * with a single `apikey` header and nothing else (no Authorization, no cookie,
 * no body). Reads ONLY `response.status`; never the body, an error message, or a
 * header. Read-only by construction: `GET` on a relation that does not exist.
 */
export async function defaultBuildPublishableKeySmokeProbe(
  url: string,
  publishableKey: string,
): Promise<PublishableKeySmokeProbe> {
  const probeUrl = new URL(`/rest/v1/${NONEXISTENT_PROBE_RELATION}`, url);
  return {
    probeGatewayAcceptsKey: async () => {
      try {
        const response = await fetch(probeUrl, {
          method: 'GET',
          headers: { apikey: publishableKey, accept: 'application/json' },
          redirect: 'manual',
        });
        return { status: response.status, threw: false };
      } catch {
        return { status: null, threw: true };
      }
    },
  };
}
