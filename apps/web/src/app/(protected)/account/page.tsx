import type { Metadata } from 'next';
import { AuthShell } from '@/components/auth/AuthShell';
import { requireUser } from '@/lib/auth/require-user';
import { AccountSettings } from './AccountSettings';

export const metadata: Metadata = { title: 'アカウント設定', robots: { index: false, follow: false } };

/**
 * "My account" for every signed-in role (Staff, Manager, Owner): sign-in
 * email, language, password change (current password re-checked), sign out
 * on other devices. Reached from the account menu in each header.
 */
export default async function AccountPage() {
  const user = await requireUser();
  return (
    <AuthShell title="accountTitle">
      <AccountSettings email={user.email ?? ''} />
    </AuthShell>
  );
}
