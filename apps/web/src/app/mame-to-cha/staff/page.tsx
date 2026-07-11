import { StaffView } from '@/components/demo/cafe/views/StaffView';
import { LangProvider } from '@/lib/demo/cafe/i18n';
import { BrandProvider, MAME_TO_CHA_BRAND } from '@/lib/demo/brand';

export default function MameToChaStaffPage() {
  return (
    <BrandProvider brand={MAME_TO_CHA_BRAND}>
      <LangProvider>
        <StaffView />
      </LangProvider>
    </BrandProvider>
  );
}
