'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { BrandMark } from './BrandMark';
import { mutedText } from '@/lib/demo/cafe/theme';
import { useLang } from '@/lib/demo/cafe/i18n';
import { tManager } from '@/lib/demo/cafe/i18n.manager';

interface ManagerHeaderProps {
  /** Line shown under the "店長ダッシュボード" title — brand/environment name for the demo, tenant/location name for the DB-backed preview. */
  subtitle: string;
  /** Optional right-aligned slot (e.g. the demo's reset button, or the preview's "back to top" link). */
  rightSlot?: ReactNode;
  /** When set, the brand mark links back to the Cafe hub (same pattern as `RecipeView`'s header logo). Omitted by callers that already provide their own back-to-hub affordance in `rightSlot`. */
  homeHref?: string;
}

/**
 * Shared manager-dashboard header — brand mark + "店長ダッシュボード" title + a
 * caller-supplied subtitle/right-slot. Used by both `/demo/cafe/manager` (via
 * `ManagerView`) and the DB-backed `_client-preview/mame-to-cha/manager` page,
 * so the two always show the same header regardless of where the data (or
 * the right-slot action) comes from.
 */
export function ManagerHeader({ subtitle, rightSlot, homeHref }: ManagerHeaderProps) {
  const { lang } = useLang();
  const mark = homeHref ? (
    <Link href={homeHref} aria-label={tManager(lang, 'backToHub')} style={{ display: 'flex' }}>
      <BrandMark size={52} />
    </Link>
  ) : (
    <BrandMark size={52} />
  );
  return (
    <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {mark}
        <div>
          <h1 style={{ margin: 0, fontSize: 24 }}>{tManager(lang, 'dashboardTitle')}</h1>
          <p style={{ margin: '2px 0 0', ...mutedText }}>{subtitle}</p>
        </div>
      </div>
      {rightSlot}
    </header>
  );
}
