import { RecipeView } from '@/components/demo/cafe/views/RecipeView';
import { LangProvider } from '@/lib/demo/cafe/i18n';
import { BrandProvider, CAFE_DEMO_BRAND } from '@/lib/demo/brand';

export default function CafeRecipesDemoPage() {
  return (
    <BrandProvider brand={CAFE_DEMO_BRAND}>
      <LangProvider>
        <RecipeView />
      </LangProvider>
    </BrandProvider>
  );
}
