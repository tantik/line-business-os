import { RecipeView } from '@/components/demo/cafe/views/RecipeView';
import { LangProvider } from '@/lib/demo/cafe/i18n';
import { BrandProvider, MAME_TO_CHA_BRAND } from '@/lib/demo/brand';

export default function MameToChaRecipesPage() {
  return (
    <BrandProvider brand={MAME_TO_CHA_BRAND}>
      <LangProvider>
        <RecipeView />
      </LangProvider>
    </BrandProvider>
  );
}
