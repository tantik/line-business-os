import { HubView } from '@/components/demo/cafe/views/HubView';
import { BrandProvider, MAME_TO_CHA_BRAND } from '@/lib/demo/brand';

export default function MameToChaHubPage() {
  return (
    <BrandProvider brand={MAME_TO_CHA_BRAND}>
      <HubView />
    </BrandProvider>
  );
}
