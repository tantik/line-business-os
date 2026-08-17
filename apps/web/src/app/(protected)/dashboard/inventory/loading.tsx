import { pageStyle } from '@/lib/ui/theme';
import { SkeletonBlock, SkeletonCard } from '@/components/skeleton';

/** Route-specific loading skeleton, roughly matching page.tsx's shape (header, filter bar, item rows) to avoid a layout jump when real content arrives. */
export default function InventoryLoading() {
  return (
    <main style={pageStyle(880)}>
      <header>
        <SkeletonBlock width={140} height={28} />
        <SkeletonBlock width={280} height={16} style={{ marginTop: 12 }} />
      </header>

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <SkeletonBlock width={70} height={44} style={{ borderRadius: 8 }} />
        <SkeletonBlock width={120} height={44} style={{ borderRadius: 8 }} />
        <SkeletonBlock width={70} height={44} style={{ borderRadius: 8 }} />
        <SkeletonBlock height={44} style={{ borderRadius: 8, flex: 1 }} />
      </div>

      {[0, 1, 2].map((i) => (
        <SkeletonCard key={i}>
          <SkeletonBlock width={160} height={18} />
          <SkeletonBlock width="70%" height={14} style={{ marginTop: 10 }} />
          <SkeletonBlock height={44} style={{ marginTop: 12, borderRadius: 8 }} />
        </SkeletonCard>
      ))}
    </main>
  );
}
