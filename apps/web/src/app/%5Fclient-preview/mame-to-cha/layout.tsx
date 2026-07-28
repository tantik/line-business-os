import type { ReactNode } from 'react';
import { demoColors } from '@/lib/demo/cafe/theme';

/**
 * Shared visual boundary for every DB-backed Mame To Cha surface.
 *
 * The root application shell is intentionally dark, while the Cafe package
 * uses the warm light palette. Keeping that boundary here prevents Manager,
 * Staff, Recipes, and their safe states from drifting into route-specific
 * wrappers or exposing the root background between Cafe cards.
 */
export default function MameToChaPreviewLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: demoColors.bg, color: demoColors.textPrimary }}>
      {children}
    </div>
  );
}
