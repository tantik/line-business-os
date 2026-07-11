import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { demoColors } from '@/lib/demo/cafe/theme';

export const metadata: Metadata = {
  title: 'Mame To Cha Tokyo Demo | LINE Business OS',
  description: 'LINEで使えるカフェ運営ミニOSの公開デモ（サンプルデータ・クライアント向けブランド版）',
};

/**
 * Public, unauthenticated shell for the client-branded cafe workforce demo
 * ("Mame To Cha Tokyo"). Mirrors `app/demo/cafe/layout.tsx` — same shared
 * view components, no session/tenant context, mock data only. Only the name
 * and a rough visual-identity idea (accent color) are reused from the old
 * cafe-shift reference project; no official Japanese shop name is invented
 * and no code/assets are copied from that project.
 */
export default function MameToChaLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: demoColors.bg, color: demoColors.textPrimary }}>
      {children}
    </div>
  );
}
