import type { CSSProperties } from 'react';
import { colors } from '@/lib/ui/theme';

interface SkeletonProps {
  /** CSS width value, e.g. '100%', 180. Defaults to full width of its container. */
  width?: string | number;
  /** CSS height value, e.g. 16, '2rem'. Defaults to a single text-line height. */
  height?: string | number;
  /** Rounded like a badge/avatar instead of a text-line block. */
  circle?: boolean;
  style?: CSSProperties;
}

/**
 * Pulsing loading placeholder for content that hasn't arrived yet (a popup's
 * body while its data loads, a list before the first fetch resolves).
 * Pure CSS animation, no JS timers — safe to mount/unmount freely.
 */
export function Skeleton({ width = '100%', height = 16, circle = false, style }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width,
        height,
        borderRadius: circle ? '50%' : 6,
        background: colors.surfaceElevated,
        position: 'relative',
        overflow: 'hidden',
        ...style,
      }}
    >
      <span className="shared-design-kit-skeleton-shimmer" />
      <style>{`
        .shared-design-kit-skeleton-shimmer {
          position: absolute;
          inset: 0;
          background: linear-gradient(
            90deg,
            transparent 0%,
            rgba(255, 255, 255, 0.55) 50%,
            transparent 100%
          );
          animation: shared-design-kit-skeleton-pulse 1.3s ease-in-out infinite;
        }
        @keyframes shared-design-kit-skeleton-pulse {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        @media (prefers-reduced-motion: reduce) {
          .shared-design-kit-skeleton-shimmer { animation: none; }
        }
      `}</style>
    </span>
  );
}

/** Convenience: a stack of text-line skeletons, e.g. inside a popup body while its detail data loads. */
export function SkeletonLines({ count = 3, lineHeight = 14, gap = 10 }: { count?: number; lineHeight?: number; gap?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap }}>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} height={lineHeight} width={i === count - 1 ? '60%' : '100%'} />
      ))}
    </div>
  );
}
