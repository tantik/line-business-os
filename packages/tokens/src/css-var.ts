/**
 * Helpers to reference a token as a CSS custom property.
 *
 * The `--oruwa-*` variables are emitted into `dist/tokens.css` and loaded once
 * via `apps/web/src/app/globals.css`. Use `cssVar(...)` in NEW code that runs
 * through the CSS pipeline (Tailwind arbitrary values, CSS Modules). Do NOT use
 * it in modules imported by `node --test` — those need the literal values from
 * `./semantic.ts` / `./primitives.ts` instead.
 */

/** CSS custom-property namespace for the ORUWA design system. */
export const CSS_VAR_PREFIX = '--oruwa-';

/** `varName('color', 'bg')` -> `--oruwa-color-bg`. */
export function varName(group: string, key: string): string {
  return `${CSS_VAR_PREFIX}${group}-${normalizeKey(key)}`;
}

/** `cssVar('color', 'bg')` -> `var(--oruwa-color-bg)`. */
export function cssVar(group: string, key: string, fallback?: string): string {
  const name = varName(group, key);
  return fallback ? `var(${name}, ${fallback})` : `var(${name})`;
}

/** Numeric object keys ("2xl") and dotted keys are normalized to kebab-safe segments. */
function normalizeKey(key: string): string {
  return String(key).replace(/\./g, '-');
}
