import type { Lang } from '@/lib/demo/cafe/i18n';

/** Display minus sign: an ASCII "-" next to a dash reads as a range ("—–-15"). */
function num(value: number): string {
  return value < 0 ? `−${Math.abs(value)}` : String(value);
}

/**
 * One label for a numeric check's target range, shared by the template list,
 * the Staff task modal and the exception card. A one-sided limit reads as a
 * limit, not as a range with a dash for the missing end: freezer max -15 °C
 * -> 「−15 °C以下」 / "≤ −15 °C"; hot-holding min 65 °C -> 「65 °C以上」 / "≥ 65 °C".
 * Returns null when neither bound is set.
 */
export function formatNumericRange(lang: Lang, min: number | null, max: number | null, unit: string | null): string | null {
  const u = unit ? ` ${unit}` : '';
  if (min !== null && max !== null) return `${num(min)}–${num(max)}${u}`;
  if (max !== null) return lang === 'ja' ? `${num(max)}${u}以下` : `≤ ${num(max)}${u}`;
  if (min !== null) return lang === 'ja' ? `${num(min)}${u}以上` : `≥ ${num(min)}${u}`;
  return null;
}
