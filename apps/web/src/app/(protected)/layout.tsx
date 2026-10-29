import type { ReactNode } from 'react';
import { requireUserId } from '@/lib/auth/require-user';
import { PendingInvitationBanner } from '@/components/workforce/PendingInvitationBanner';
import { PendingTenantInvitationBanner } from '@/components/tenant/PendingTenantInvitationBanner';
import { ToastProvider } from '@/components/shared/design-kit/Toast';

/**
 * Authenticated routes depend on the per-request session cookie and the
 * runtime Supabase env, so they must be rendered dynamically — never statically
 * prerendered at build time (which has no session and no public env).
 */
export const dynamic = 'force-dynamic';

/**
 * Protected route group. Every segment under `(protected)` requires an
 * authenticated session; unauthenticated requests are redirected to sign-in by
 * `requireUserId` (server-side, verified JWT -- DEBT-124). This is the single
 * place auth is enforced for the group — child pages then resolve tenant
 * context. Pages that must see a revoked session at once (account settings,
 * platform admin console) call the network-validated `requireUser` themselves.
 */
export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  await requireUserId();
  return (
    <ToastProvider>
      <PendingTenantInvitationBanner />
      <PendingInvitationBanner />
      {children}
    </ToastProvider>
  );
}
