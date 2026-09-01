import { z } from 'zod';
import {
  type EnvSource,
  type ParseEnvResult,
  formatIssues,
} from './env.public.js';

/**
 * Centralized, validated environment access.
 *
 * Security model:
 * - `serverEnv()` may read secrets (privileged Supabase key, PII keys, LINE
 *   secrets). It MUST only be imported from server contexts (apps/api,
 *   apps/worker, packages/db, packages/line server code) — never a client
 *   component/route. Client code imports `@line-os/config/env/public`.
 * - The browser-safe surface (`publicEnv()`, `parsePublicEnv`, `PublicEnv`)
 *   lives in `./env.public.ts` and is re-exported here for compatibility.
 *
 * Fail-fast: parsing throws at boot if a required variable is missing.
 *
 * SUPABASE API KEYS (Phase 9 of the legacy-key migration —
 * docs/operations/supabase-secret-key-migration-runbook.md; Cloud DEV's legacy
 * JWT-based `anon`/`service_role` API keys are disabled):
 * - `SUPABASE_SECRET_KEY` — the current privileged (RLS-bypassing, server-only)
 *   key: one `sb_secret_*` value. REQUIRED. `serverEnv().supabasePrivilegedKey`
 *   exposes it; `createServiceClient()` reads it.
 * - `SUPABASE_PUBLISHABLE_KEY` — the current low-privilege app key: one
 *   `sb_publishable_*` value. REQUIRED. It is sent ALONGSIDE the caller's own
 *   JWT by `createUserClient()`, so RLS and permission checks are unchanged; it
 *   never bypasses RLS. `serverEnv().supabaseUserKey` exposes it.
 * - The legacy `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_ANON_KEY` fallbacks were
 *   removed in Phase 9. A rollback that re-enables the legacy Cloud keys would
 *   ALSO need this code reverted.
 */

// Re-export the browser-safe surface unchanged.
export {
  type EnvSource,
  type ParseEnvResult,
  type PublicEnv,
  formatIssues,
  parsePublicEnv,
  publicEnv,
} from './env.public.js';

/** Treat an unset OR empty/whitespace-only value as absent. */
const requiredKey = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  z.string().min(1),
);

const serverBaseSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // Supabase / Postgres
  SUPABASE_URL: z.string().url(),
  // Low-privilege app API key — the current `sb_publishable_*` model, REQUIRED.
  SUPABASE_PUBLISHABLE_KEY: requiredKey,
  // Privileged key — the current `sb_secret_*` model, REQUIRED. Server-only.
  SUPABASE_SECRET_KEY: requiredKey,
  DATABASE_URL: z.string().min(1),

  // PII protection
  PII_ENCRYPTION_KEY: z.string().min(1),
  PII_HASH_PEPPER: z.string().min(16),

  // LINE
  LINE_CHANNEL_SECRET: z.string().min(1),
  LINE_CHANNEL_ACCESS_TOKEN: z.string().min(1),
  LINE_LIFF_ID: z.string().optional(),

  // API
  API_PORT: z.coerce.number().int().positive().default(3001),
  WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
});

const serverSchema = serverBaseSchema.transform((env) => ({
  ...env,
  // The schema guarantees both keys are present and non-empty; trim the
  // low-privilege value's surrounding whitespace for the resolved form.
  supabasePrivilegedKey: env.SUPABASE_SECRET_KEY,
  supabaseUserKey: env.SUPABASE_PUBLISHABLE_KEY.trim(),
}));

export type ServerEnv = z.infer<typeof serverSchema>;

let cachedServer: ServerEnv | null = null;

/**
 * Validate the server env (which MAY include secrets) from an arbitrary source
 * WITHOUT throwing. Server-only — never call from browser code.
 */
export function parseServerEnv(source: EnvSource): ParseEnvResult<ServerEnv> {
  const parsed = serverSchema.safeParse(source);
  if (parsed.success) return { success: true, data: parsed.data };
  const missing = [...new Set(parsed.error.issues.map((i) => i.path.join('.')))];
  return { success: false, missing, message: formatIssues(parsed.error) };
}

export function serverEnv(): ServerEnv {
  if (cachedServer) return cachedServer;
  const parsed = parseServerEnv(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid server environment:\n${parsed.message}`);
  }
  cachedServer = parsed.data;
  return cachedServer;
}
