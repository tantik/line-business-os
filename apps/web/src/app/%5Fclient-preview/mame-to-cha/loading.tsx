import { pageStyle } from '@/lib/demo/cafe/theme';
import { PreviewSkeletonStyle, SkeletonBlock, SkeletonCard } from '@/components/demo/cafe/PreviewSkeleton';

/**
 * Route-segment loading UI for the Staff preview root (`page.tsx`), shown
 * automatically while its server data batch is in flight. Also covers
 * `/staff` (a bare `permanentRedirect` to this same route). Approximates the
 * real page's card layout (header, today summary, shift table, action
 * buttons) so the swap to real content reads as a fill-in, not a jump.
 */
export default function StaffPreviewLoading() {
  return (
    <main style={pageStyle(900)}>
      <PreviewSkeletonStyle />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <SkeletonBlock width={180} height={22} />
        <SkeletonBlock width={90} height={30} radius={8} />
      </div>

      <SkeletonCard style={{ marginTop: 16 }} titleWidth={120} lines={2} />

      <SkeletonCard titleWidth={110} lines={0}>
        <div style={{ marginTop: 14, display: 'grid', gap: 6 }}>
          {Array.from({ length: 7 }).map((_, row) => (
            <SkeletonBlock key={row} height={34} radius={8} />
          ))}
        </div>
      </SkeletonCard>

      <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
        {Array.from({ length: 2 }).map((_, index) => (
          <SkeletonBlock key={index} height={44} radius={8} />
        ))}
      </div>
    </main>
  );
}
