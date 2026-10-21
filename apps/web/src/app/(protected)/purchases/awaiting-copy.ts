import type { Lang } from '@/lib/demo/cafe/i18n';

/**
 * Quantity-bearing JA/EN copy for the 「入荷待ち」 (awaiting delivery, 0137)
 * UI. Kept as small pure formatters next to `purchases-i18n.ts` because the
 * static dictionary there has no interpolation.
 */

function quantity(value: number, unit: string): string {
  return `${value} ${unit}`;
}

/** 「入荷待ち 4 L（8 Lのうち）」 / "4 L awaiting (of 8 L)". */
export function formatAwaitingLabel(lang: Lang, openQuantity: number, orderedQuantity: number, unit: string): string {
  return lang === 'ja'
    ? `入荷待ち ${quantity(openQuantity, unit)}（${quantity(orderedQuantity, unit)}のうち）`
    : `${quantity(openQuantity, unit)} awaiting (of ${quantity(orderedQuantity, unit)})`;
}

/** Body of the "cancel the rest" confirmation: states exactly what happens (and what does not). */
export function formatCancelRestBody(lang: Lang, openQuantity: number, unit: string): string {
  return lang === 'ja'
    ? `残り${quantity(openQuantity, unit)}は入荷待ちから外れます。在庫は変わりません。`
    : `The remaining ${quantity(openQuantity, unit)} will be removed from Awaiting delivery. Stock will not change.`;
}
