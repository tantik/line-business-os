import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Shared Supabase test double for this directory's read/write helper tests.
 * Not itself a `*.test.ts` file (nothing to register in package.json's test
 * script) -- imported BY the test files, mirroring `staff-profile.test.ts`'s
 * inline `recordingClient` but reusable and supporting a queue of results for
 * helpers (e.g. `submitWorkReport`) that issue more than one Supabase call.
 */
export interface RecordedCall {
  method: string;
  args: unknown[];
}

const CHAINABLE_METHODS = ['schema', 'from', 'select', 'eq', 'or', 'gte', 'lt', 'insert', 'update', 'maybeSingle', 'single', 'rpc'];

export function recordingClient(
  results: { data: unknown; error: unknown } | Array<{ data: unknown; error: unknown }>,
): { client: SupabaseClient; calls: RecordedCall[] } {
  const queue = Array.isArray(results) ? [...results] : [results];
  const calls: RecordedCall[] = [];
  const builder: Record<string, unknown> = {};

  for (const method of CHAINABLE_METHODS) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    };
  }

  builder.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
    const next = queue.length > 1 ? queue.shift()! : queue[0];
    return Promise.resolve(next).then(resolve, reject);
  };

  return { client: builder as unknown as SupabaseClient, calls };
}
