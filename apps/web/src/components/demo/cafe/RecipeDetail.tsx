import type { Recipe } from '@/lib/demo/cafe/types';
import { card, demoColors, RECIPE_BADGE_ICON, recipeBadgeIconStyle } from '@/lib/demo/cafe/theme';
import { useLang } from '@/lib/demo/cafe/i18n';
import { tRecipes, tRecipeCategory } from '@/lib/demo/cafe/i18n.recipes';
import { DemoHelpButton } from './DemoHelpButton';
import { HELP_RECIPES_INGREDIENTS, HELP_RECIPES_MEMO, HELP_RECIPES_STEPS } from '@/lib/demo/cafe/helpContent';

interface RecipeDetailProps {
  recipe: Recipe;
}

/** Inline selected-recipe detail area below the recipe strip — text/instruction focused, no product photo, no checkboxes/task-list feel. */
export function RecipeDetail({ recipe }: RecipeDetailProps) {
  const { lang } = useLang();
  const isEn = lang === 'en';
  const name = isEn ? recipe.nameEn ?? recipe.name : recipe.name;
  const description = isEn ? recipe.descriptionEn ?? recipe.description : recipe.description;
  const ingredients = isEn ? recipe.ingredientsEn ?? recipe.ingredients : recipe.ingredients;
  const steps = isEn ? recipe.stepsEn ?? recipe.steps : recipe.steps;
  const memo = isEn ? recipe.memoEn ?? recipe.memo : recipe.memo;
  const memoTitle = isEn ? recipe.memoTitleEn ?? recipe.memoTitle : recipe.memoTitle;
  const isPopular = recipe.badges.includes('人気');

  return (
    <section style={{ ...card, marginTop: 14 }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>{name}</h2>
          {isPopular ? (
            <span
              title="人気"
              style={recipeBadgeIconStyle(RECIPE_BADGE_ICON['人気'].background, RECIPE_BADGE_ICON['人気'].color)}
            >
              {RECIPE_BADGE_ICON['人気'].icon}
            </span>
          ) : null}
        </div>
        <p style={{ margin: '4px 0 0', fontSize: 12.5, color: demoColors.textMuted }}>{tRecipeCategory(lang, recipe.category)}</p>
      </div>

      <p style={{ margin: '14px 0 0', fontSize: 13.5, lineHeight: 1.7, color: demoColors.textPrimary }}>{description}</p>

      <div style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: demoColors.textPrimary }}>{tRecipes(lang, 'ingredients')}</div>
          <DemoHelpButton content={HELP_RECIPES_INGREDIENTS} />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {ingredients.map((ingredient) => (
            <span
              key={ingredient}
              style={{
                fontSize: 12.5,
                padding: '5px 10px',
                borderRadius: 999,
                background: demoColors.surfaceElevated,
                color: demoColors.textPrimary,
              }}
            >
              {ingredient}
            </span>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: demoColors.textPrimary }}>{tRecipes(lang, 'steps')}</div>
          <DemoHelpButton content={HELP_RECIPES_STEPS} />
        </div>
        <ol style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 8 }}>
          {steps.map((step, index) => (
            <li key={index} style={{ fontSize: 13.5, lineHeight: 1.6, color: demoColors.textPrimary }}>
              {step}
            </li>
          ))}
        </ol>
      </div>

      {memo ? (
        <div
          style={{
            marginTop: 16,
            padding: '10px 12px',
            borderRadius: 8,
            background: demoColors.goldMuted,
            fontSize: 12.5,
            lineHeight: 1.6,
            color: demoColors.goldDark,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <div style={{ fontWeight: 700 }}>{memoTitle ?? (isEn ? 'Note' : 'メモ')}</div>
            <DemoHelpButton content={HELP_RECIPES_MEMO} />
          </div>
          {memo}
        </div>
      ) : null}
    </section>
  );
}
