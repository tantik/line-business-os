'use client';

import type { ReactNode } from 'react';
import { BrandMark } from './BrandMark';
import { mutedText } from '@/lib/demo/cafe/theme';

interface ManagerHeaderProps {
  /** Line shown under the "店長ダッシュボード" title — brand/environment name for the demo, tenant/location name for the DB-backed preview. */
  subtitle: string;
  /** Optional right-aligned slot (e.g. the demo's reset button, or the preview's "back to top" link). */
  rightSlot?: ReactNode;
}

/**
 * Shared manager-dashboard header — brand mark + "店長ダッシュボード" title + a
 * caller-supplied subtitle/right-slot. Used by both `/demo/cafe/manager` (via
 * `ManagerView`) and the DB-backed `_client-preview/mame-to-cha/manager` page,
 * so the two always show the same header regardless of where the data (or
 * the right-slot action) comes from.
 */
export function ManagerHeader({ subtitle, rightSlot }: ManagerHeaderProps) {
  return (
    <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <BrandMark size={52} />
        <div>
          <h1 style={{ margin: 0, fontSize: 24 }}>店長ダッシュボード</h1>
          <p style={{ margin: '2px 0 0', ...mutedText }}>{subtitle}</p>
        </div>
      </div>
      {rightSlot}
    </header>
  );
}
