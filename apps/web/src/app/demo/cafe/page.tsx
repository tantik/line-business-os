import { HubView } from '@/components/demo/cafe/views/HubView';
import { BrandProvider, CAFE_DEMO_BRAND } from '@/lib/demo/brand';

export default function CafeDemoHubPage() {
  return (
    <BrandProvider brand={CAFE_DEMO_BRAND}>
      <HubView />
    </BrandProvider>
  );
}
