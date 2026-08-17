import type { CSSProperties, ReactNode } from 'react';
import { card, colors } from '@/lib/ui/theme';

/**
 * Static gray-block skeleton primitives for route-specific `loading.tsx`
 * files (Cafe v2.1 QA audit §8: the generic `(protected)/loading.tsx`
 * spinner-style fallback showed no shape of the page underneath, causing a
 * layout jump once real content arrived on a slow connection). No
 * animation/JS -- these render from a Server Component, same as the
 * fallback they replace.
 */
export function SkeletonBlock({
  width = '100%',
  height = 14,
  style,
}: {
  width?: number | string;
  height?: number | string;
  style?: CSSProperties;
}) {
  return <div style={{ width, height, background: colors.surfaceElevated, borderRadius: 6, ...style }} />;
}

export function SkeletonCard({ children, style }: { children?: ReactNode; style?: CSSProperties }) {
  return <section style={{ ...card, ...style }}>{children}</section>;
}
