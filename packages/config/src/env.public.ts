import { z } from 'zod';

/**
 * BROWSER-SAFE environment access.
 *
 * This module intentionally contains ONLY the public (`NEXT_PUBLIC_*`) schema
 * and its parsers. It has NO reference to the server schema, so importing it
 * from a client component/route CANNOT drag the server-env zod object (with the
 * `SUPABASE_SECRET_KEY` field declaration) into a browser bundle.
 * `@line-os/config/env` re-exports everything here for backward compatibility;
 * client code should import from `@line-os/config/env/public` directly.
 *
 * Even so: NO field here is a secret, and none carries a `.default()` value —
 * only names and validators would ever be bundled, never a value.
 *
 * LOW-PRIVILEGE SUPABASE API KEY:
 * - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — the current model: one
 *   `sb_publishable_*` value. REQUIRED. Not a secret and does not bypass RLS —
 *   the caller's own JWT stays the identity/auth context.
 * - The legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` fallback was removed in Phase 9
 *   of the legacy-key migration (docs/operations/supabase-secret-key-migration-runbook.md);
 *   Cloud DEV's legacy JWT-based API keys are disabled. A rollback that
 *   re-enables them would ALSO need this code reverted.
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
// LOW-PRIVILEGE Supabase API key — the ONE place the read/trim rule lives. Both
// the public schema below and the server schema in `./env.ts` (which re-imports
// it) use it, so the browser client, server client, middleware, and the Node
// user client cannot drift apart.
//
// The low-privilege key is the app-level key sent ALONGSIDE the caller's own
// JWT so RLS and permission checks apply unchanged — it is NOT privileged and
// never bypasses RLS. Phase 9: the current `sb_publishable_*` key is REQUIRED;
// there is no legacy `anon` fallback. Fail closed (value-free) if it is absent.
// ---------------------------------------------------------------------------

/** Treat `undefined` / empty / whitespace-only as absent; return the trimmed value, else `null`. */
export function resolveLowPrivilegeSupabaseKey(input: {
  publishableKey: string | undefined;
}): string | null {
  if (typeof input.publishableKey !== 'string') return null;
  const trimmed = input.publishableKey.trim();
  return trimmed === '' ? null : trimmed;
}

/** Treat an unset OR empty/whitespace-only value as absent. */
const requiredPublicKey = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  z.string().min(1),
);

const publicBaseSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  // Low-privilege app API key — the current `sb_publishable_*` model, REQUIRED.
  // Empty string == absent (see `requiredPublicKey`). No legacy `anon` fallback.
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: requiredPublicKey,
  NEXT_PUBLIC_LIFF_ID: z.string().optional(),
});

const publicSchema = publicBaseSchema.transform((env) => {
  // The schema guarantees a non-empty publishable key; trim any surrounding
  // whitespace for the resolved value.
  const key = resolveLowPrivilegeSupabaseKey({
    publishableKey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  }) as string;
  return { ...env, supabasePublishableKey: key };
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
