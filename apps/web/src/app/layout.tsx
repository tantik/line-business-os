import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Noto_Sans_JP } from 'next/font/google';
import { colors } from '@/lib/ui/theme';
import { fontFamily } from '@line-os/tokens';
import './globals.css';

/**
 * Design System v1 fix (technical audit finding M): `fontFamily.base` named
 * "Noto Sans JP" but nothing actually loaded it — no `next/font`, no
 * `@font-face`, no `<link>`. Most devices silently fell back to `system-ui`.
 * `next/font/google` self-hosts the font (no runtime request to Google,
 * no layout shift) and exposes it as a CSS variable, kept first in the
 * fallback stack below so `fontFamily.base`'s existing fallback chain still
 * applies if the font somehow fails to load.
 */
const notoSansJP = Noto_Sans_JP({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-noto-sans-jp',
});

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
    <html lang="ja" className={notoSansJP.variable}>
      <body
        style={{
          fontFamily: `var(--font-noto-sans-jp), ${fontFamily.base}`,
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
