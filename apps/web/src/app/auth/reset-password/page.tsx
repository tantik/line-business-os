import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthShell } from '@/components/auth/AuthShell';
import { createClient } from '@/lib/supabase/server';
import { LINK_INVALID_PATH, hasRecentRecoverySession } from '@/lib/auth/password-reset';
import { ResetPasswordForm } from './ResetPasswordForm';

// Session-dependent (the just-verified recovery session): never prerender.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: '新しいパスワードの設定', robots: { index: false, follow: false } };

/**
 * New-password screen for the self-service reset flow. Reachable only with a
 * session opened by a recovery link in the last 15 minutes; anyone else
 * (signed out, or signed in with an ordinary password session) gets the
 * invalid-link page. `completePasswordReset` re-checks the same condition.
 */
export default async function ResetPasswordPage() {
  const supabase = await createClient();
  if (!(await hasRecentRecoverySession(supabase))) redirect(`${LINK_INVALID_PATH}?reason=reset`);

  return (
    <AuthShell title="resetTitle" lead="resetLead">
      <ResetPasswordForm />
    </AuthShell>
  );
}
