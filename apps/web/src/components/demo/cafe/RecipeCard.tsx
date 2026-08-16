'use client';

import type { Recipe } from '@/lib/demo/cafe/types';
import { demoColors, INSTRUCTION_ICON, RECIPE_BADGE_ICON, recipeBadgeIconStyle } from '@/lib/demo/cafe/theme';
import { useLang } from '@/lib/demo/cafe/i18n';

interface RecipeCardProps {
  recipe: Recipe;
  selected: boolean;
  onOpen: (recipe: Recipe) => void;
}

/** Badge tooltip label, JA/EN — same two badge keys the detail view (`RecipeDetail.tsx`) already localizes. */
const BADGE_LABEL: Record<string, { ja: string; en: string }> = {
  インストラクション: { ja: 'インストラクション', en: 'Instruction' },
  人気: { ja: '人気', en: 'Popular' },
};

/** Popular (人気) shows as a single star on the card — New/Seasonal badges are intentionally not shown here (kept only on the detail view) to keep the card UI simple. */
function cardBadgeIcons(recipe: Recipe): Array<{ key: string; icon: string; background: string; color: string }> {
  const icons: Array<{ key: string; icon: string; background: string; color: string }> = [];
  if (recipe.contentKind === 'instruction') {
    icons.push({ key: 'インストラクション', ...INSTRUCTION_ICON });
  }
  if (recipe.badges.includes('人気')) {
    icons.push({ key: '人気', ...RECIPE_BADGE_ICON['人気'] });
  }
  return icons;
}

/** Compact thumbnail card for the 2-row scannable recipe grid — sized so mobile shows ~3.5 cards/row (an intentional scroll affordance). */
export function RecipeCard({ recipe, selected, onOpen }: RecipeCardProps) {
  const { lang } = useLang();
  const badgeIcons = cardBadgeIcons(recipe);
  const name = lang === 'en' ? recipe.nameEn ?? recipe.name : recipe.name;

  return (
    <button
      type="button"
      onClick={() => onOpen(recipe)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 5,
        width: 98,
        textAlign: 'left',
        padding: 5,
        borderRadius: 8,
        border: `1.5px solid ${selected ? demoColors.accent : demoColors.border}`,
        background: selected ? demoColors.accentMuted : demoColors.surface,
        cursor: 'pointer',
      }}
    >
      <div style={{ position: 'relative' }}>
        <div
          style={{
            width: '100%',
            aspectRatio: '1 / 1',
            borderRadius: 6,
            background: demoColors.surfaceElevated,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 32,
            overflow: 'hidden',
          }}
        >
          {recipe.image ? (
            <img
              src={recipe.image}
              alt=""
              // Every card in this horizontally-scrolling strip renders up
              // front (no pagination gate like the Manager list has), so
              // unlike that list this one leans on the browser's own
              // viewport-distance heuristic instead: only cards near the
              // visible scroll position fetch immediately, the rest defer
              // until they're scrolled into range.
              loading="lazy"
              decoding="async"
              style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            recipe.icon
          )}
        </div>
        {badgeIcons.length > 0 ? (
          <div style={{ position: 'absolute', top: 4, right: 4, display: 'flex', gap: 2 }}>
            {badgeIcons.map((badge) => (
              <span
                key={badge.key}
                title={lang === 'en' ? BADGE_LABEL[badge.key]?.en ?? badge.key : badge.key}
                style={{
                  ...recipeBadgeIconStyle(badge.background, badge.color),
                  boxShadow: '0 1px 2px rgba(54, 43, 31, 0.18)',
                }}
              >
                {badge.icon}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <strong
        style={{
          fontSize: 11.5,
          lineHeight: 1.3,
          color: demoColors.textPrimary,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          padding: '0 1px',
        }}
      >
        {name}
      </strong>
      {(lang === 'en' ? recipe.translationNotice : recipe.translationNoticeJa) === 'original' ? (
        <span style={{ fontSize: 9.5, color: demoColors.goldDark, fontWeight: 700 }}>
          {lang === 'en' ? 'JA original' : 'EN原文'}
        </span>
      ) : null}
    </button>
  );
}
