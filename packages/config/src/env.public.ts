import { z } from 'zod';

/**
 * BROWSER-SAFE environment access.
 *
 * This module intentionally contains ONLY the public (`NEXT_PUBLIC_*`) schema
 * and its parsers. It has NO reference to the server schema, so importing it
 * from a client component/route CANNOT drag the server-env zod object (with
 * `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_SECRET_KEY` field declarations) into a
 * browser bundle. `@line-os/config/env` re-exports everything here for
 * backward compatibility; client code should import from
 * `@line-os/config/env/public` directly.
 *
 * Even so: NO field here is a secret, and none carries a `.default()` value —
 * only names and validators would ever be bundled, never a value.
 *
 * LOW-PRIVILEGE SUPABASE API KEY (transition, Phase 1 of the legacy-key
 * migration — docs/operations/supabase-secret-key-migration-runbook.md):
 * - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — the current model: one
 *   `sb_publishable_*` value. PREFERRED.
 * - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — the legacy `anon` JWT. Accepted as a
 *   TEMPORARY fallback while Cloud DEV / Vercel are migrated; removed in a
 *   later PR. At least one of the two must be set (publishable wins if both
 *   are). `supabasePublishableKey` resolves it; `supabasePublishableKeySource`
 *   records which one was used. Neither is a secret and neither bypasses RLS —
 *   the caller's own JWT stays the identity/auth context.
 */

/** Source object shape accepted by the parse helpers (e.g. `process.env`). */
export type EnvSource = Record<string, string | undefined>;

/**
 * Result of a non-throwing env parse. `missing` lists the offending variable
 * names (paths) and `message` describes the problems. Neither field ever
 * contains an actual secret VALUE — only names and zod constraint messages — so
 * results are safe to log or surface in development/test errors.
 */
export type ParseEnvResult<T> =
  | { success: true; data: T }
  | { success: false; missing: string[]; message: string };

export function formatIssues(error: z.ZodError): string {
  return error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
}

// ---------------------------------------------------------------------------
// LOW-PRIVILEGE Supabase API key precedence — the ONE place this fallback rule
// lives. Both the public schema below and the server schema in `./env.ts`
// (which re-imports it from here) use it, so the browser client, server
// client, middleware, and the Node user client cannot drift apart.
//
// The low-privilege key is the app-level key sent ALONGSIDE the caller's own
// JWT so RLS and permission checks apply unchanged — it is NOT privileged and
// never bypasses RLS. Phase 1 of the legacy-`anon` → current-`publishable`
// migration (docs/operations/supabase-secret-key-migration-runbook.md): prefer
// `sb_publishable_*`; fall back to the legacy `anon` JWT during the transition;
// fail closed (value-free) if neither is usable.
// ---------------------------------------------------------------------------

/** Which source the resolved low-privilege key came from — non-secret, safe to log. */
export type LowPrivilegeKeySource = 'publishable' | 'legacy_anon';

export interface ResolvedLowPrivilegeKey {
  key: string;
  source: LowPrivilegeKeySource;
}

/** Treat `undefined` / empty / whitespace-only as absent; return the trimmed value. */
function presentKey(value: string | undefined): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

/**
 * Resolve the low-privilege key from an already-collected pair. Returns `null`
 * when neither source is usable, so the caller can raise its own schema-shaped,
 * value-free error naming the variables it knows about. Precedence: a non-empty
 * publishable key wins; otherwise a non-empty legacy `anon` key; otherwise
 * `null` (fail closed).
 */
export function resolveLowPrivilegeSupabaseKey(input: {
  publishableKey: string | undefined;
  anonKey: string | undefined;
}): ResolvedLowPrivilegeKey | null {
  const publishable = presentKey(input.publishableKey);
  if (publishable) return { key: publishable, source: 'publishable' };

  const anon = presentKey(input.anonKey);
  if (anon) return { key: anon, source: 'legacy_anon' };

  return null;
}

/** Treat an unset OR empty/whitespace-only value as absent. */
const optionalPublicKey = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  z.string().min(1).optional(),
);

const publicBaseSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  // Low-privilege app API key — publishable preferred, legacy `anon` temporary
  // fallback. Both optional at the field level (empty string == absent); the
  // object-level check below requires at least one. See the module header and
  // `resolveLowPrivilegeSupabaseKey` above.
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: optionalPublicKey,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalPublicKey,
  NEXT_PUBLIC_LIFF_ID: z.string().optional(),
});

const PUBLIC_LOW_PRIV_KEY_MESSAGE =
  'Set NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (preferred: an sb_publishable_* value) or the legacy NEXT_PUBLIC_SUPABASE_ANON_KEY. At least one is required; if both are set, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is used.';

const publicSchema = publicBaseSchema
  .superRefine((env, ctx) => {
    if (!env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY && !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'],
        message: PUBLIC_LOW_PRIV_KEY_MESSAGE,
      });
    }
  })
  .transform((env) => {
    // superRefine guarantees at least one is present.
    const resolved = resolveLowPrivilegeSupabaseKey({
      publishableKey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      anonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    }) as { key: string; source: LowPrivilegeKeySource };
    return {
      ...env,
      supabasePublishableKey: resolved.key,
      supabasePublishableKeySource: resolved.source,
    };
  });

export type PublicEnv = z.infer<typeof publicSchema>;

let cachedPublic: PublicEnv | null = null;

/**
 * Validate the browser-safe public env from an arbitrary source WITHOUT
 * throwing. Only reads `NEXT_PUBLIC_*` names, so it is safe to call from browser
 * code (the source there only carries inlined public values). Useful for
 * rendering a "missing configuration" state instead of crashing.
 */
export function parsePublicEnv(source: EnvSource): ParseEnvResult<PublicEnv> {
  const parsed = publicSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: source.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: source.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: source.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_LIFF_ID: source.NEXT_PUBLIC_LIFF_ID,
  });
  if (parsed.success) return { success: true, data: parsed.data };
  const missing = [...new Set(parsed.error.issues.map((i) => i.path.join('.')))];
  return { success: false, missing, message: formatIssues(parsed.error) };
}

export function publicEnv(): PublicEnv {
  if (cachedPublic) return cachedPublic;
  const parsed = parsePublicEnv(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid public environment:\n${parsed.message}`);
  }
  cachedPublic = parsed.data;
  return cachedPublic;
}
