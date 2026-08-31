import { z } from 'zod';
import {
  type EnvSource,
  type ParseEnvResult,
  type LowPrivilegeKeySource,
  formatIssues,
  resolveLowPrivilegeSupabaseKey,
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
 * PRIVILEGED SUPABASE KEY (transition, Phase 1 of the legacy-key migration —
 * docs/operations/supabase-secret-key-migration-runbook.md):
 * - `SUPABASE_SECRET_KEY` — the current Supabase model: one `sb_secret_*`
 *   value. PREFERRED.
 * - `SUPABASE_SERVICE_ROLE_KEY` — the legacy JWT service_role key. Accepted as
 *   a TEMPORARY fallback while Cloud DEV is migrated; removed in a later PR.
 * - At least one of the two must be set; SUPABASE_SECRET_KEY is preferred. If
 *   both are set, SUPABASE_SECRET_KEY wins and the legacy key stays as an
 *   untriggered fallback (useful for rollback during the migration).
 *   `serverEnv().supabasePrivilegedKey` resolves it (secret key first);
 *   `supabasePrivilegedKeySource` records which one was used. Both are
 *   RLS-bypassing and server-only.
 *
 * LOW-PRIVILEGE SUPABASE API KEY (same migration, `anon` → publishable):
 * - `SUPABASE_PUBLISHABLE_KEY` — the current model: one `sb_publishable_*`
 *   value. PREFERRED.
 * - `SUPABASE_ANON_KEY` — the legacy `anon` JWT. Accepted as a TEMPORARY
 *   fallback while Cloud DEV is migrated; removed in a later PR.
 * - At least one of the two must be set; publishable is preferred. This is the
 *   app-level key for `createUserClient()` — it is sent ALONGSIDE the caller's
 *   own JWT, so RLS and permission checks are unchanged. It is NOT privileged
 *   and never bypasses RLS. `serverEnv().supabaseUserKey` resolves it;
 *   `supabaseUserKeySource` records which one was used.
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
const optionalKey = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  z.string().min(1).optional(),
);

const serverBaseSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // Supabase / Postgres
  SUPABASE_URL: z.string().url(),
  // Low-privilege app API key — publishable preferred, legacy `anon` temporary
  // fallback. Both optional at the field level (empty string == absent); the
  // object-level check below requires at least one.
  SUPABASE_PUBLISHABLE_KEY: optionalKey,
  SUPABASE_ANON_KEY: optionalKey,
  // Privileged key — see the module header. Both optional at the field level
  // (empty string == absent); the object-level check below requires at least one.
  SUPABASE_SECRET_KEY: optionalKey,
  SUPABASE_SERVICE_ROLE_KEY: optionalKey,
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

const PRIVILEGED_KEY_MESSAGE =
  'Set SUPABASE_SECRET_KEY (preferred: an sb_secret_* value) or the legacy SUPABASE_SERVICE_ROLE_KEY. At least one is required; if both are set, SUPABASE_SECRET_KEY is used.';

const LOW_PRIVILEGE_KEY_MESSAGE =
  'Set SUPABASE_PUBLISHABLE_KEY (preferred: an sb_publishable_* value) or the legacy SUPABASE_ANON_KEY. At least one is required; if both are set, SUPABASE_PUBLISHABLE_KEY is used.';

const serverSchema = serverBaseSchema
  .superRefine((env, ctx) => {
    if (!env.SUPABASE_PUBLISHABLE_KEY && !env.SUPABASE_ANON_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SUPABASE_PUBLISHABLE_KEY'],
        message: LOW_PRIVILEGE_KEY_MESSAGE,
      });
    }
    if (!env.SUPABASE_SECRET_KEY && !env.SUPABASE_SERVICE_ROLE_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SUPABASE_SECRET_KEY'],
        message: PRIVILEGED_KEY_MESSAGE,
      });
    }
  })
  .transform((env) => {
    // superRefine guarantees at least one of each pair is present.
    const usingSecretKey = Boolean(env.SUPABASE_SECRET_KEY);
    const lowPrivilege = resolveLowPrivilegeSupabaseKey({
      publishableKey: env.SUPABASE_PUBLISHABLE_KEY,
      anonKey: env.SUPABASE_ANON_KEY,
    }) as { key: string; source: LowPrivilegeKeySource };
    return {
      ...env,
      supabasePrivilegedKey: (env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY) as string,
      supabasePrivilegedKeySource: usingSecretKey
        ? ('secret_key' as const)
        : ('legacy_service_role' as const),
      supabaseUserKey: lowPrivilege.key,
      supabaseUserKeySource: lowPrivilege.source,
    };
  });

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
