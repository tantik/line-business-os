import { ManagerView } from '@/components/demo/cafe/views/ManagerView';
import { BrandProvider, MAME_TO_CHA_BRAND } from '@/lib/demo/brand';

export default function MameToChaManagerPage() {
  return (
    <BrandProvider brand={MAME_TO_CHA_BRAND}>
      <ManagerView />
    </BrandProvider>
  );
}
