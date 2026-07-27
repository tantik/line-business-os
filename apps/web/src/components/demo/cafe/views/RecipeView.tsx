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

function sortRecipes(recipes: Recipe[]): Recipe[] {
  return [...recipes].sort((a, b) => {
  const instructionOrder =
    Number(b.contentKind === 'instruction') - Number(a.contentKind === 'instruction');
  if (instructionOrder !== 0) return instructionOrder;

  const popularOrder = Number(b.badges.includes('人気')) - Number(a.badges.includes('人気'));
  if (popularOrder !== 0) return popularOrder;

  return a.name.localeCompare(b.name, 'ja');
  });
}

export interface RecipeBrowserProps {
  recipes: Recipe[];
}

/** Shared recipe/manual card browser. Its caller owns only the data source. */
export function RecipeBrowser({ recipes }: RecipeBrowserProps) {
  const brand = useBrand();
  const { lang } = useLang();
  const sortedRecipes = sortRecipes(recipes);
  const [selectedId, setSelectedId] = useState(sortedRecipes[0]?.id ?? '');
  const selectedRecipe = sortedRecipes.find((recipe) => recipe.id === selectedId) ?? sortedRecipes[0] ?? null;

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
        {sortedRecipes.map((recipe) => (
          <RecipeCard key={recipe.id} recipe={recipe} selected={recipe.id === selectedId} onOpen={(r) => setSelectedId(r.id)} />
        ))}
      </div>

      {selectedRecipe ? <RecipeDetail recipe={selectedRecipe} /> : (
        <p style={{ marginTop: 14, color: demoColors.textMuted }}>公開中のレシピはありません。</p>
      )}
    </main>
  );
}

/** Demo adapter: shared presentation with mock/local demo data. */
export function RecipeView() {
  return <RecipeBrowser recipes={RECIPES} />;
}
