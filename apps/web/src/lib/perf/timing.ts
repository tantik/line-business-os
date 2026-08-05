import 'server-only';

/**
 * TEMPORARY performance-measurement instrumentation for the Cafe v2.1 Manager
 * page/Server Action latency investigation. Logging has been removed (no
 * `console.log` output regardless of env state); call sites elsewhere are
 * kept working as no-op wrappers. Remove this file (and its call sites) once
 * the measured optimization work lands.
 */
export async function time<T>(_label: string, fn: () => Promise<T>): Promise<T> {
  return fn();
}

export function mark(_label: string) {
  return;
}
