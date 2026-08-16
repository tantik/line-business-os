import { StaffView } from '@/components/demo/cafe/views/StaffView';
import { LangProvider } from '@/lib/demo/cafe/i18n';
import { BrandProvider, CAFE_DEMO_BRAND } from '@/lib/demo/brand';

export default function CafeStaffDemoPage() {
  return (
    <BrandProvider brand={CAFE_DEMO_BRAND}>
      <LangProvider>
        <StaffView />
      </LangProvider>
    </BrandProvider>
  );
}
