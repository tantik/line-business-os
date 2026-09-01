#!/usr/bin/env node
/**
 * CLI wrapper for the Supabase Publishable API Key read-only verification.
 *
 * Usage (operator, against Cloud DEV — see the runbook for the value-free
 * supply procedure; the repo-root `.env` already carries SUPABASE_URL +
 * SUPABASE_PUBLISHABLE_KEY and no legacy fallback):
 *
 *   node --import tsx --env-file=<gitignored .env file> \
 *     packages/db/scripts/publishable-key-smoke-cli.ts
 *
 * Prints exactly one line — a fixed category token, optionally followed by a
 * non-sensitive ` (detail)` — and exits 0 ONLY on `PUBLISHABLE_KEY_SMOKE_OK`.
 * Never prints a credential, a header, or an environment value.
 */
import {
  runPublishableKeySmoke,
  type PublishableKeySmokeResult,
} from './publishable-key-smoke.js';

export interface PublishableKeySmokeCliDeps {
  run?: typeof runPublishableKeySmoke;
  print?: (line: string) => void;
}

export async function runPublishableKeySmokeCli(
  deps: PublishableKeySmokeCliDeps = {},
): Promise<number> {
  const print = deps.print ?? console.log;
  const run = deps.run ?? runPublishableKeySmoke;

  let result: PublishableKeySmokeResult;
  try {
    // Pass the whole environment object; `publishable-key-smoke.ts` reads only
    // `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` off it and never a
    // `process.env.<NAME>` member expression.
    result = await run({ env: process.env });
  } catch {
    print('SMOKE_FAIL_UNKNOWN (unexpected error)');
    return 1;
  }

  print(result.detail ? `${result.category} (${result.detail})` : result.category);
  return result.category === 'PUBLISHABLE_KEY_SMOKE_OK' ? 0 : 1;
}

if (process.argv[1]?.replaceAll('\\', '/').endsWith('/publishable-key-smoke-cli.ts')) {
  process.exitCode = await runPublishableKeySmokeCli();
}
