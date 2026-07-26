import type { ReactNode } from 'react';
import { demoColors } from '@/lib/demo/cafe/theme';

export default function MameToChaPreviewStaffLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: demoColors.bg, color: demoColors.textPrimary }}>
      {children}
    </div>
  );
}
