'use client';

import { useState } from 'react';
import Link from 'next/link';
import { RecipeCard } from '@/components/demo/cafe/RecipeCard';
import { RecipeDetail } from '@/components/demo/cafe/RecipeDetail';
import { BrandMark } from '@/components/demo/cafe/BrandMark';
import { LangToggle } from '@/components/demo/cafe/LangToggle';
import { DemoHelpButton } from '@/components/demo/cafe/DemoHelpButton';
import { HELP_RECIPES_SHARING } from '@/lib/demo/cafe/helpContent';
import { useLang } from '@/lib/demo/cafe/i18n';
import { tRecipes } from '@/lib/demo/cafe/i18n.recipes';
import { RECIPES } from '@/lib/demo/cafe/data';
import { demoColors, mobilePageStyle } from '@/lib/demo/cafe/theme';
import type { Recipe } from '@/lib/demo/cafe/types';
import { useBrand } from '@/lib/demo/brand';

const SORTED_RECIPES: Recipe[] = [...RECIPES].sort((a, b) => {
  const instructionOrder =
    Number(b.contentKind === 'instruction') - Number(a.contentKind === 'instruction');
  if (instructionOrder !== 0) return instructionOrder;

  const popularOrder = Number(b.badges.includes('人気')) - Number(a.badges.includes('人気'));
  if (popularOrder !== 0) return popularOrder;

  return a.name.localeCompare(b.name, 'ja');
});

/** Recipe/manual card browser. Shared by `/demo/cafe/recipes` and `/mame-to-cha/recipes`. */
export function RecipeView() {
  const brand = useBrand();
  const { lang } = useLang();
  const [selectedId, setSelectedId] = useState(SORTED_RECIPES[0]!.id);
  const selectedRecipe = SORTED_RECIPES.find((recipe) => recipe.id === selectedId) ?? SORTED_RECIPES[0]!;

  return (
    <main style={mobilePageStyle(720)}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '4px 2px' }}>
        <Link href={brand.homePath} style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: 'inherit' }}>
          <BrandMark size={32} />
          <span style={{ fontSize: 14, fontWeight: 700 }}>{lang === 'ja' ? brand.nameJa : brand.name}</span>
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: demoColors.textMuted }}>{tRecipes(lang, 'recipeSharing')}</span>
          <DemoHelpButton content={HELP_RECIPES_SHARING} />
          <LangToggle />
        </div>
      </header>

      <div
        style={{
          marginTop: 14,
          display: 'grid',
          gridAutoFlow: 'column',
          gridTemplateRows: 'repeat(2, auto)',
          gridAutoColumns: 98,
          gap: 8,
          overflowX: 'auto',
          padding: '2px 2px 8px',
        }}
      >
        {SORTED_RECIPES.map((recipe) => (
          <RecipeCard key={recipe.id} recipe={recipe} selected={recipe.id === selectedId} onOpen={(r) => setSelectedId(r.id)} />
        ))}
      </div>

      <RecipeDetail recipe={selectedRecipe} />
    </main>
  );
}
