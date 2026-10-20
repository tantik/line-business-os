import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { colors } from '@/lib/ui/theme';
import { fontFamily } from '@line-os/tokens';
import '@fontsource-variable/noto-sans-jp/wght.css';
import './globals.css';

/**
 * Noto Sans JP, self-hosted from the `@fontsource-variable/noto-sans-jp`
 * package (OFL-1.1): one variable font (weights 100-900) split into the same
 * `unicode-range` woff2 chunks Google Fonts serves, emitted into
 * `/_next/static/media` at build time. The browser downloads only the chunks
 * a page's characters need; no request to Google at build time or at runtime.
 *
 * Replaces `next/font/google`, whose build-time fetch from Google Fonts
 * failed `next build` on CI and locally (`Failed to fetch Noto Sans JP`,
 * `Cannot read properties of null (reading '1')`). The family is exposed as
 * `--font-noto-sans-jp` (globals.css) and kept first in the fallback stack
 * below, so `fontFamily.base`'s fallback chain still applies.
 */

export const metadata: Metadata = {
  title: { default: 'ORUWA', template: '%s | ORUWA' },
  description: 'ORUWA — 店舗運営をひとつに',
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
