import type { ReactNode } from 'react';
import { demoColors } from '@/lib/demo/cafe/theme';

/**
 * Scoped to the DB-backed manager preview route only (not the rest of
 * `_client-preview/mame-to-cha`, which still uses the dark app theme via
 * `@/lib/ui/theme`) - the root layout (`app/layout.tsx`) sets a dark body
 * background for the whole app, and without this wrapper the manager route's
 * light cafe cards (`@/lib/demo/cafe/theme`) sat directly on that dark body,
 * showing as large dark gaps between the white/beige section cards. Mirrors
 * `app/demo/cafe/layout.tsx`'s wrapper, one level down so only the manager
 * route is affected.
 */
export default function MameToChaManagerPreviewLayout({ children }: { children: ReactNode }) {
  return <div style={{ minHeight: '100vh', background: demoColors.bg, color: demoColors.textPrimary }}>{children}</div>;
}
