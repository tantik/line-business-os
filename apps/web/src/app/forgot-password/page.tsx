import type { Metadata } from 'next';
import { AuthShell } from '@/components/auth/AuthShell';
import { ForgotPasswordForm } from './ForgotPasswordForm';

/** Self-service password reset request (DEBT-088). Public; works signed in or out. */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'パスワードの再設定', robots: { index: false, follow: false } };

export default function ForgotPasswordPage() {
  return (
    <AuthShell title="forgotTitle">
      <ForgotPasswordForm />
    </AuthShell>
  );
}
