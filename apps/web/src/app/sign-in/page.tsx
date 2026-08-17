import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { DASHBOARD_PATH, resolvePostLoginPath } from '@/lib/auth/post-login-redirect';
import { getActiveTenantContext } from '@/lib/tenant/context';
import { createClient } from '@/lib/supabase/server';
import { sanitizePreviewReturnTo } from '@/lib/preview/return-to';
import { alertDanger, mutedText, pageStyle } from '@/lib/ui/theme';
import { SignInForm } from './SignInForm';

/**
 * Minimal email/password sign-in page.
 *
 * Server component: the form (`SignInForm`) still posts directly to the
 * `signIn` Server Action via the native `action` prop - no client-side fetch,
 * no Supabase client in the browser, no manual redirect handling. `SignInForm`
 * is a small client component only so it can track a local `isSubmitting`
 * flag for the pending/disabled button state; it does not intercept or
 * replace the submission itself. Already authenticated visitors are sent
 * straight to their role's primary workspace (`resolvePostLoginPath`), same
 * as a fresh sign-in. A generic error is shown when `?error=1` is
 * present (set by the action on bad input or failed auth) - we never reveal
 * which field was wrong or echo the auth error.
 *
 * Sign-up, password reset, OAuth/social, and LINE login are intentionally NOT
 * implemented in this phase (foundation only).
 */
export const dynamic = 'force-dynamic';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; returnTo?: string }>;
}) {
  const params = await searchParams;
  const safeReturnTo = sanitizePreviewReturnTo(params?.returnTo);

  const user = await getCurrentUser();
  if (user) {
    if (safeReturnTo) redirect(safeReturnTo);
    let destination: string = DASHBOARD_PATH;
    const tenantContext = await getActiveTenantContext({ user });
    if (tenantContext.status === 'success') {
      const supabase = await createClient();
      destination = await resolvePostLoginPath(supabase, tenantContext.data.activeTenant.tenantId);
    }
    redirect(destination);
  }

  const hasError = Boolean(params?.error);

  return (
    <main style={pageStyle(420)}>
      <h1>Sign in</h1>
      <p style={{ ...mutedText, marginTop: 0 }}>
        Sign in to LINE Business OS with your email and password.
      </p>

      {hasError ? (
        <p role="alert" style={alertDanger}>
          Invalid email or password. Please try again.
        </p>
      ) : null}

      <SignInForm returnTo={safeReturnTo} />

      <p style={{ ...mutedText, fontSize: 13, marginTop: 16 }}>
        Sign-up, password reset, and social login are not available yet.
      </p>
    </main>
  );
}
