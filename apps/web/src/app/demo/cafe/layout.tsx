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
 * only. See docs/phase-1j-2-cafe-workforce-demo-to-production-plan.md and
 * docs/phase-1n-4a-cafe-demo-package-closeout.md.
 *
 * `/demo/cafe` is a premium product-overview hub linking to the three
 * direct-entry screens `/demo/cafe/staff`, `/demo/cafe/manager` and
 * `/demo/cafe/recipes` (mirroring three separate future LINE Rich Menu /
 * manager-link entry points). This shell only provides the warm page
 * background. No in-UI disclaimer banner is shown; the demo/testing
 * explanation is handled outside the UI.
 */
export default function DemoCafeLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: demoColors.bg, color: demoColors.textPrimary }}>
      {children}
    </div>
  );
}
