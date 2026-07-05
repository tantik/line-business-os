import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { demoColors } from '@/lib/demo/cafe/theme';

export const metadata: Metadata = {
  title: 'Mirawi Cafe Demo | LINE Business OS',
  description: 'LINEで使えるカフェ運営ミニOSの公開デモ（サンプルデータ）',
};

/**
 * Public, unauthenticated shell for the cafe workforce sales demo. Lives
 * outside `(protected)` on purpose — no session/tenant context, mock data
 * only. See docs/phase-1j-2-cafe-workforce-demo-to-production-plan.md.
 *
 * `/demo/cafe`, `/demo/cafe/recipes` and `/demo/cafe/manager` are three
 * separate direct-entry screens (mirroring three separate future LINE Rich
 * Menu / manager-link entry points) and intentionally share no navigation —
 * this shell only provides the warm page background. No in-UI disclaimer
 * banner is shown; the demo/testing explanation is handled outside the UI.
 */
export default function DemoCafeLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: demoColors.bg, color: demoColors.textPrimary }}>
      {children}
    </div>
  );
}
