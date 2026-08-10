import { pageStyle } from '@/lib/demo/cafe/theme';
import { PreviewSkeletonStyle, SkeletonBlock, SkeletonCard } from '@/components/demo/cafe/PreviewSkeleton';

/**
 * Next.js route-segment loading UI - shown automatically while
 * `manager/page.tsx`'s server data batch (12+ parallel queries) is in
 * flight. Approximates that page's real card layout (Today tiles, shift
 * table, staff/recipe/inventory management, settings, shift exchange) so the
 * swap to real content reads as a fill-in, not a layout jump.
 */
export default function ManagerPreviewLoading() {
  return (
    <main style={pageStyle(1180)}>
      <PreviewSkeletonStyle />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <SkeletonBlock width={220} height={22} />
        <SkeletonBlock width={140} height={30} radius={8} />
      </div>

      <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
        {Array.from({ length: 4 }).map((_, index) => (
          <SkeletonBlock key={index} height={64} radius={10} />
        ))}
      </div>

      <SkeletonCard style={{ marginTop: 16 }} titleWidth={110} lines={0}>
        <div style={{ marginTop: 14, display: 'grid', gap: 6 }}>
          {Array.from({ length: 6 }).map((_, row) => (
            <SkeletonBlock key={row} height={36} radius={8} />
          ))}
        </div>
      </SkeletonCard>

      <SkeletonCard titleWidth={180} lines={2} />
      <SkeletonCard titleWidth={130} lines={3} />
      <SkeletonCard titleWidth={150} lines={2} />
    </main>
  );
}
