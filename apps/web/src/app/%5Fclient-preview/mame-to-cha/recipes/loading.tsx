import { pageStyle, card } from '@/lib/demo/cafe/theme';
import { PreviewSkeletonStyle, SkeletonBlock } from '@/components/demo/cafe/PreviewSkeleton';

/**
 * Route-segment loading UI for the Recipes preview (`recipes/page.tsx`),
 * shown automatically while its recipe/translation/media-signing batch is in
 * flight. Approximates the real page's recipe-card grid so the swap to real
 * content reads as a fill-in, not a layout jump.
 */
export default function RecipesPreviewLoading() {
  return (
    <main style={pageStyle(1100)}>
      <PreviewSkeletonStyle />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <SkeletonBlock width={160} height={22} />
        <SkeletonBlock width={90} height={30} radius={8} />
      </div>

      <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} style={{ ...card, margin: 0, padding: 10 }}>
            <SkeletonBlock height={110} radius={8} />
            <div style={{ marginTop: 10 }}>
              <SkeletonBlock height={13} width="80%" />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
