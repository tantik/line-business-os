import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { colors } from '@/lib/ui/theme';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'LINE Business OS', template: '%s | LINE Business OS' },
  description: 'Multi-tenant SaaS platform for Japanese SMBs',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icons/icon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/icons/icon-32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
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
