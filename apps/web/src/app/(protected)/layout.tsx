import type { ReactNode } from 'react';
import { requireUser } from '@/lib/auth/require-user';

/**
 * Authenticated routes depend on the per-request session cookie and the
 * runtime Supabase env, so they must be rendered dynamically — never statically
 * prerendered at build time (which has no session and no public env).
 */
export const dynamic = 'force-dynamic';

/**
 * Protected route group. Every segment under `(protected)` requires an
 * authenticated session; unauthenticated requests are redirected to sign-in by
 * `requireUser` (server-side). This is the single place auth is enforced for
 * the group — child pages then resolve tenant context.
 */
export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  await requireUser();
  return <>{children}</>;
}
