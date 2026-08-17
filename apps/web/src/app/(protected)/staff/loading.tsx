import { pageStyle } from '@/lib/ui/theme';
import { SkeletonBlock, SkeletonCard } from '@/components/skeleton';

/** Route-specific loading skeleton, roughly matching page.tsx's shape (header, profile card, weekly schedule) to avoid a layout jump when real content arrives. */
export default function StaffLoading() {
  return (
    <main style={pageStyle(1000)}>
      <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <SkeletonBlock width={180} height={28} />
          <SkeletonBlock width={160} height={16} />
        </div>
        <SkeletonBlock width={90} height={44} style={{ borderRadius: 8 }} />
      </header>

      <SkeletonCard style={{ marginTop: 24 }}>
        <SkeletonBlock width={160} height={18} />
        <div style={{ display: 'grid', rowGap: 8, marginTop: 12 }}>
          <SkeletonBlock width="40%" height={14} />
          <SkeletonBlock width="40%" height={14} />
          <SkeletonBlock width="40%" height={14} />
        </div>
      </SkeletonCard>

      <SkeletonCard>
        <SkeletonBlock width={220} height={18} />
        {[0, 1, 2].map((i) => (
          <SkeletonBlock key={i} height={40} style={{ marginTop: 10, borderRadius: 8 }} />
        ))}
      </SkeletonCard>
    </main>
  );
}
