import { pageStyle } from '@/lib/ui/theme';
import { SkeletonBlock, SkeletonCard } from '@/components/skeleton';

/** Route-specific loading skeleton, roughly matching page.tsx's shape (header, attention card, staff table, weekly schedule) to avoid a layout jump when real content arrives. */
export default function ManagerLoading() {
  return (
    <main style={pageStyle(1180)}>
      <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <SkeletonBlock width={220} height={28} />
          <SkeletonBlock width={160} height={16} />
        </div>
        <SkeletonBlock width={90} height={44} style={{ borderRadius: 8 }} />
      </header>

      <SkeletonCard style={{ marginTop: 24 }}>
        <SkeletonBlock width={140} height={18} />
        <SkeletonBlock width="60%" height={14} style={{ marginTop: 12 }} />
      </SkeletonCard>

      <SkeletonCard>
        <SkeletonBlock width={100} height={18} />
        {[0, 1, 2].map((i) => (
          <SkeletonBlock key={i} height={44} style={{ marginTop: 10, borderRadius: 8 }} />
        ))}
      </SkeletonCard>

      <SkeletonCard>
        <SkeletonBlock width={220} height={18} />
        {[0, 1, 2].map((i) => (
          <SkeletonBlock key={i} height={44} style={{ marginTop: 10, borderRadius: 8 }} />
        ))}
      </SkeletonCard>
    </main>
  );
}
