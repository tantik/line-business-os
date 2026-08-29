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

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_LIFF_ID: z.string().optional(),
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
