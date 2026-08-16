import type { CSSProperties, ReactNode } from 'react';

export interface ThumbnailImageProps {
  src: string | undefined | null;
  alt: string;
  size: number;
  borderRadius?: number;
  /** Rendered in place of the image when there is no `src` at all (e.g. an emoji icon). */
  fallback?: ReactNode;
  /** Rendered when a `src` is expected but hasn't resolved yet (e.g. a signed URL still loading). */
  pending?: boolean;
  background?: string;
  /** Placeholder color shown while `pending` — deliberately distinct from `background` so it reads as a skeleton, not empty space. */
  skeletonColor?: string;
  /**
   * 'eager' only for a thumbnail that is *itself* guaranteed to be on
   * screen the moment it mounts — e.g. a single always-visible preview in a
   * form, not any row in a list or grid. A row existing in the DOM (because
   * a list renders in batches, pages, or via its own load-more
   * IntersectionObserver) is NOT the same thing as that row being inside
   * the viewport: a batch of 20 rendered rows can easily have only 6-8
   * actually visible, with the rest still below the fold. Do not set
   * `eager` to "skip a redundant check" for list/grid thumbnails — leave
   * the ORUWA default of 'lazy', which defers to the browser's own
   * viewport-distance heuristic and correctly loads only what's visible or
   * near-visible, with no manual IntersectionObserver required per image.
   */
  priority?: 'eager' | 'lazy';
  className?: string;
  style?: CSSProperties;
}

/**
 * Shared viewport-aware thumbnail shell: fixed size (no layout shift while
 * the image resolves), a lightweight placeholder in place of any flash, and
 * `loading`/`decoding` wired for the ORUWA standard instead of ad hoc per
 * call site. Intended for reuse across recipes, inventory, staff avatars,
 * galleries, and attachments — no domain-specific logic lives here.
 */
export function ThumbnailImage({
  src,
  alt,
  size,
  borderRadius = 7,
  fallback,
  pending,
  background = 'rgba(0, 0, 0, 0.05)',
  skeletonColor = 'rgba(0, 0, 0, 0.12)',
  priority = 'lazy',
  className,
  style,
}: ThumbnailImageProps) {
  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius,
        overflow: 'hidden',
        background,
        display: 'grid',
        placeItems: 'center',
        flexShrink: 0,
        ...style,
      }}
    >
      {src ? (
        <img
          src={src}
          alt={alt}
          loading={priority}
          decoding="async"
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : pending ? (
        <span aria-hidden style={{ width: '100%', height: '100%', display: 'block', opacity: 0.5, background: skeletonColor }} />
      ) : (
        fallback ?? null
      )}
    </div>
  );
}
