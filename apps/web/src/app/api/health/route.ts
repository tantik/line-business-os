import { NextResponse } from 'next/server';
import { getHealthReport } from '@/lib/health/health';

/**
 * Public, unauthenticated health endpoint for external uptime monitoring.
 *
 * - `nodejs` runtime + `force-dynamic` so the check is never statically cached
 *   and always reflects live dependency state.
 * - Returns JSON only. 200 for `ok`/`degraded`, 503 for `unhealthy`.
 * - Exposes coarse dependency states only — no secrets, URLs, ids, or tenant
 *   data (see `@/lib/health/health`). Excluded from session-refresh middleware.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const { report, httpStatus } = await getHealthReport();
  return NextResponse.json(report, { status: httpStatus });
}
