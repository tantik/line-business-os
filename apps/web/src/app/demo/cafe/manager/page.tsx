import { ManagerView } from '@/components/demo/cafe/views/ManagerView';
import { BrandProvider, CAFE_DEMO_BRAND } from '@/lib/demo/brand';
import { LangProvider } from '@/lib/demo/cafe/i18n';

export default function CafeManagerDemoPage() {
  return (
    <BrandProvider brand={CAFE_DEMO_BRAND}>
      <LangProvider>
        <ManagerView />
      </LangProvider>
    </BrandProvider>
  );
}
