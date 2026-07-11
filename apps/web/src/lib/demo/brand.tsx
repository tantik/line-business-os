'use client';

import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { demoColors } from '@/lib/demo/cafe/theme';
import { DEMO_CAFE_NAME, DEMO_CAFE_NAME_JA } from '@/lib/demo/cafe/data';

/**
 * Cross-brand demo identity (name + accent colors + route prefix) for the
 * public cafe workforce demo package. Both `/demo/cafe*` and `/mame-to-cha*`
 * render the same shared view components from `components/demo/cafe/views`;
 * this is the only thing that differs between the two trees. No logo image
 * asset exists for either brand — `BrandMark` renders a text/initial glyph
 * using these colors, not an external image.
 */
export interface DemoBrand {
  slug: string;
  /** Route prefix used to build in-package links, e.g. '/demo/cafe' or '/mame-to-cha'. */
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

/**
 * Client-branded demo package. Only the name and a rough visual-identity
 * idea (accent color) are reused from the old cafe-shift reference project —
 * no official Japanese shop name is invented, no code or assets copied.
 */
export const MAME_TO_CHA_BRAND: DemoBrand = {
  slug: 'mame-to-cha',
  homePath: '/mame-to-cha',
  name: 'Mame To Cha Tokyo',
  nameJa: 'Mame To Cha Tokyo',
  taglineJa: 'カフェ向け勤務管理デモ',
  accent: '#9C6B3E',
  accentStrong: '#6F4A29',
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
