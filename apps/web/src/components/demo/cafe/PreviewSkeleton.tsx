import type { CSSProperties, ReactNode } from 'react';
import { card, demoColors } from '@/lib/demo/cafe/theme';

/**
 * Shared building blocks for `loading.tsx` route skeletons under the Mame To
 * Cha preview (`app/_client-preview/mame-to-cha/**`). Next.js renders these
 * automatically (via the implicit route-segment `<Suspense>` boundary) while
 * the real page's server data batch is in flight, so they must approximate
 * that page's actual card layout - not just "a spinner" - or the swap from
 * skeleton to real content reads as a layout jump instead of a fill-in.
 */

/** A single pulsing placeholder rectangle. `width`/`height` accept any CSS length. */
export function SkeletonBlock({ width = '100%', height = 14, radius = 6, style }: { width?: number | string; height?: number | string; radius?: number; style?: CSSProperties }) {
  return (
    <span
      aria-hidden
      className="preview-skeleton-block"
      style={{ display: 'block', width, height, borderRadius: radius, ...style }}
    />
  );
}

/** A `card`-shaped section placeholder - title bar plus either a configurable number of auto-generated body lines, or, when given, `children` describing the section's real inner shape (e.g. a grid of row placeholders). */
export function SkeletonCard({ titleWidth = 140, lines = 3, style, children }: { titleWidth?: number | string; lines?: number; style?: CSSProperties; children?: ReactNode }) {
  return (
    <section style={{ ...card, ...style }}>
      <SkeletonBlock width={titleWidth} height={16} />
      {children ?? (
        <div style={{ marginTop: 14, display: 'grid', gap: 8 }}>
          {Array.from({ length: lines }).map((_, index) => (
            <SkeletonBlock key={index} height={12} width={index === lines - 1 ? '60%' : '100%'} />
          ))}
        </div>
      )}
    </section>
  );
}

/** Once-per-tree stylesheet for the pulse animation - safe to render from every skeleton composite since a duplicate `<style>` tag is harmless. */
export function PreviewSkeletonStyle() {
  return (
    <style>{`
      .preview-skeleton-block {
        background: linear-gradient(90deg, ${demoColors.border} 25%, ${demoColors.surfaceElevated} 37%, ${demoColors.border} 63%);
        background-size: 400% 100%;
        animation: preview-skeleton-pulse 1.4s ease-in-out infinite;
      }
      @media (prefers-reduced-motion: reduce) {
        .preview-skeleton-block { animation: none; }
      }
      @keyframes preview-skeleton-pulse {
        0% { background-position: 100% 50%; }
        100% { background-position: 0 50%; }
      }
    `}</style>
  );
}
