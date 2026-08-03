import 'server-only';

/**
 * TEMPORARY performance-measurement instrumentation for the Cafe v2.1 Manager
 * page/Server Action latency investigation. Not wired to any always-on
 * logging path -- gated by `PERF_TIMING_LOG=1` so it never fires in a normal
 * dev/Preview session. Remove this file (and its call sites) once the
 * measured optimization work lands.
 */
const ENABLED = process.env.PERF_TIMING_LOG === '1';

export async function time<T>(label: string, fn: () => Promise<T>): Promise<T> {
  if (!ENABLED) return fn();
  const start = performance.now();
  try {
    return await fn();
  } finally {
    const ms = performance.now() - start;
    console.log(`[perf] ${label}: ${ms.toFixed(1)}ms`);
  }
}

export function mark(label: string) {
  if (!ENABLED) return;
  console.log(`[perf] ${label}: ${performance.now().toFixed(1)}ms (mark)`);
}
