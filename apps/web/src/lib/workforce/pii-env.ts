/**
 * PII protection env access, scoped to apps/web (SERVER-ONLY).
 *
 * No `server-only` import here: unlike `supabase/server.ts` (the actual
 * client-construction boundary), this module is imported by the testable
 * service-layer helpers (`employees.ts`, `employee-line-links.ts`) that unit
 * tests call directly with a stubbed client -- same reasoning as
 * `auth/user.ts` staying framework-agnostic. It is still only ever reached at
 * runtime through those helpers, which are themselves only imported from
 * `'use server'` action files or server components, never from client code.
 *
 * Deliberately does NOT import `@line-os/config`'s `serverEnv()`: that schema
 * bundles `PII_ENCRYPTION_KEY`/`PII_HASH_PEPPER` together with
 * `SUPABASE_SERVICE_ROLE_KEY`, and its own doc comment restricts it to
 * apps/api, apps/worker, packages/db, and packages/line server code --
 * apps/web is not one of them (see CLAUDE.md's "never expose service_role to
 * the frontend or bundle it into apps/web"). Reading these two values
 * independently means apps/web's env surface never has to name
 * `SUPABASE_SERVICE_ROLE_KEY` at all, let alone require it to be set.
 *
 * Mirrors `lib/supabase/env.ts`'s non-throwing-read / throwing-require split.
 */
export interface PiiEnvConfig {
  encryptionKey: string;
  hashPepper: string;
}

export type ReadPiiEnvResult = { ok: true; config: PiiEnvConfig } | { ok: false; missing: string[] };

/** Non-throwing read; use to render/return a "missing configuration" state. */
export function readPiiEnv(): ReadPiiEnvResult {
  const encryptionKey = process.env.PII_ENCRYPTION_KEY;
  const hashPepper = process.env.PII_HASH_PEPPER;

  const missing: string[] = [];
  if (!encryptionKey) missing.push('PII_ENCRYPTION_KEY');
  if (!hashPepper || hashPepper.length < 16) missing.push('PII_HASH_PEPPER');
  if (missing.length > 0) return { ok: false, missing };

  return { ok: true, config: { encryptionKey: encryptionKey as string, hashPepper: hashPepper as string } };
}

/**
 * Throwing read for write paths that cannot proceed without config. The error
 * names the missing variables only -- never their values.
 */
export function requirePiiEnv(): PiiEnvConfig {
  const result = readPiiEnv();
  if (!result.ok) {
    throw new Error(`Missing required PII protection env: ${result.missing.join(', ')}.`);
  }
  return result.config;
}
