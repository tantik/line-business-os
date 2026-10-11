import type { Metadata } from 'next';
import { AuthLink, AuthShell, AuthText } from '@/components/auth/AuthShell';

export const metadata: Metadata = { title: 'ページが見つかりません', robots: { index: false, follow: false } };

/** App-wide 404 (replaces the framework's English "This page could not be found."). */
export default function NotFound() {
  return (
    <AuthShell title="notFoundTitle">
      <AuthText k="notFoundBody" />
      <AuthLink href="/" k="goHome" asButton />
    </AuthShell>
  );
}
