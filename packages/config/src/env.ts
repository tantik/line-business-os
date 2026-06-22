import { z } from 'zod';

/**
 * Centralized, validated environment access.
 *
 * Security model:
 * - `serverEnv()` may read secrets (service_role, PII keys, LINE secrets).
 *   It MUST only be imported from server contexts (apps/api, apps/worker,
 *   packages/db, packages/line server code).
 * - `publicEnv()` only exposes values safe to ship to the browser.
 *
 * Fail-fast: parsing throws at boot if a required variable is missing.
 */

const serverSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // Supabase / Postgres
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
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

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_LIFF_ID: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverSchema>;
export type PublicEnv = z.infer<typeof publicSchema>;

let cachedServer: ServerEnv | null = null;
let cachedPublic: PublicEnv | null = null;

function formatIssues(error: z.ZodError): string {
  return error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
}

export function serverEnv(): ServerEnv {
  if (cachedServer) return cachedServer;
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid server environment:\n${formatIssues(parsed.error)}`);
  }
  cachedServer = parsed.data;
  return cachedServer;
}

export function publicEnv(): PublicEnv {
  if (cachedPublic) return cachedPublic;
  const parsed = publicSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_LIFF_ID: process.env.NEXT_PUBLIC_LIFF_ID,
  });
  if (!parsed.success) {
    throw new Error(`Invalid public environment:\n${formatIssues(parsed.error)}`);
  }
  cachedPublic = parsed.data;
  return cachedPublic;
}
