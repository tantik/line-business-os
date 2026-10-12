import type { Metadata } from 'next';
import { AuthShell } from '@/components/auth/AuthShell';
import { requireUser } from '@/lib/auth/require-user';
import { DASHBOARD_PATH, resolvePostLoginPath } from '@/lib/auth/post-login-redirect';
import { getActiveTenantContext } from '@/lib/tenant/context';
import { createClient } from '@/lib/supabase/server';
import { AccountSettings } from './AccountSettings';

export const metadata: Metadata = { title: 'アカウント設定', robots: { index: false, follow: false } };

/**
 * "My account" for every signed-in role (Staff, Manager, Owner): sign-in
 * email, password change (current password re-checked), sign out on other
 * devices. Reached from the account menu in each header; "戻る" goes straight
 * to the caller's own workspace.
 */
export default async function AccountPage() {
  const user = await requireUser();
  let backHref: string = DASHBOARD_PATH;
  const tenantContext = await getActiveTenantContext({ user });
  if (tenantContext.status === 'success') {
    backHref = await resolvePostLoginPath(await createClient(), tenantContext.data.activeTenant.tenantId);
  }
  return (
    <AuthShell title="accountTitle">
      <AccountSettings email={user.email ?? ''} backHref={backHref} />
    </AuthShell>
  );
}
