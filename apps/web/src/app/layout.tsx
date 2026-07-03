import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { colors } from '@/lib/ui/theme';

export const metadata: Metadata = {
  title: 'LINE Business OS',
  description: 'Multi-tenant SaaS platform for Japanese SMBs',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body
        style={{
          fontFamily: 'system-ui, sans-serif',
          margin: 0,
          background: colors.bg,
          color: colors.textPrimary,
          minHeight: '100vh',
        }}
      >
        {children}
      </body>
    </html>
  );
}
