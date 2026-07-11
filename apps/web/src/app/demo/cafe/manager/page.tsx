import { ManagerView } from '@/components/demo/cafe/views/ManagerView';
import { BrandProvider, CAFE_DEMO_BRAND } from '@/lib/demo/brand';

export default function CafeManagerDemoPage() {
  return (
    <BrandProvider brand={CAFE_DEMO_BRAND}>
      <ManagerView />
    </BrandProvider>
  );
}
