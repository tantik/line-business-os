'use client';

import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { demoColors } from '@/lib/demo/cafe/theme';
import { DEMO_CAFE_NAME, DEMO_CAFE_NAME_JA } from '@/lib/demo/cafe/data';

/**
 * Demo identity (name + accent colors + route prefix) for the public cafe
 * workforce demo package (`/demo/cafe*`), which renders the shared view
 * components from `components/demo/cafe/views`. No logo image asset exists —
 * `BrandMark` renders a text/initial glyph using these colors, not an
 * external image.
 */
export interface DemoBrand {
  slug: string;
  /** Route prefix used to build in-package links, e.g. '/demo/cafe'. */
  homePath: string;
  name: string;
  nameJa: string;
  /** Neutral JA subtitle shown under the brand name on premium overview screens. */
  taglineJa: string;
  accent: string;
  accentStrong: string;
}

export const CAFE_DEMO_BRAND: DemoBrand = {
  slug: 'cafe',
  homePath: '/demo/cafe',
  name: DEMO_CAFE_NAME,
  nameJa: DEMO_CAFE_NAME_JA,
  taglineJa: 'カフェ向け勤務管理デモ',
  accent: demoColors.accent,
  accentStrong: demoColors.accentStrong,
};

const BrandContext = createContext<DemoBrand | null>(null);

export function BrandProvider({ brand, children }: { brand: DemoBrand; children: ReactNode }) {
  return <BrandContext.Provider value={brand}>{children}</BrandContext.Provider>;
}

export function useBrand(): DemoBrand {
  const ctx = useContext(BrandContext);
  if (!ctx) throw new Error('useBrand must be used within a BrandProvider');
  return ctx;
}
