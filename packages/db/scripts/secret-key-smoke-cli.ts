#!/usr/bin/env node
/**
 * CLI wrapper for the Supabase Secret API Key read-only verification.
 *
 * Usage (operator, against Cloud DEV — see the runbook and the PR description
 * for the value-free supply procedure):
 *
 *   node --import tsx --env-file=<gitignored .env file> \
 *     packages/db/scripts/secret-key-smoke-cli.ts
 *
 * Prints exactly one line — a fixed category token, optionally followed by a
 * non-sensitive ` (detail)` — and exits 0 ONLY on `SECRET_KEY_SMOKE_OK`.
 * Never prints a credential, a header, or an environment value.
 */
import { runSecretKeySmoke, type SecretKeySmokeResult } from './secret-key-smoke.js';

export interface SecretKeySmokeCliDeps {
  run?: typeof runSecretKeySmoke;
  print?: (line: string) => void;
}

export async function runSecretKeySmokeCli(deps: SecretKeySmokeCliDeps = {}): Promise<number> {
  const print = deps.print ?? console.log;
  const run = deps.run ?? runSecretKeySmoke;

  let result: SecretKeySmokeResult;
  try {
    // Pass the whole environment object; `secret-key-smoke.ts` reads only
    // `SUPABASE_URL` / `SUPABASE_SECRET_KEY` off it and never a
    // `process.env.<NAME>` member expression.
    result = await run({ env: process.env });
  } catch {
    print('SMOKE_FAIL_UNKNOWN (unexpected error)');
    return 1;
  }

  print(result.detail ? `${result.category} (${result.detail})` : result.category);
  return result.category === 'SECRET_KEY_SMOKE_OK' ? 0 : 1;
}

if (process.argv[1]?.replaceAll('\\', '/').endsWith('/secret-key-smoke-cli.ts')) {
  process.exitCode = await runSecretKeySmokeCli();
}
