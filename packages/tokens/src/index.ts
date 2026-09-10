/**
 * @line-os/tokens — the ORUWA design-system token source of truth.
 *
 * Consumers:
 *   - `apps/web/src/lib/ui/theme.ts` and `.../lib/demo/cafe/theme.ts` import the
 *     structured groups below for their literal values (keeps existing inline
 *     styles working, keeps `node --test` happy — no CSS import).
 *   - `apps/web/src/app/globals.css` imports `@line-os/tokens/tokens.css` for the
 *     `--oruwa-*` custom properties.
 *   - Phase 1: a Tailwind v4 preset is generated from `flatTokens` below.
 *
 * See `docs/design/tokens.md` for the human-readable reference and
 * `docs/design/charter.md` for the principles.
 */
import {
  breakpoint,
  control,
  duration,
  easing,
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  radius,
  shadow,
  space,
  zIndex,
} from './primitives';
import { color } from './semantic';
import { CSS_VAR_PREFIX } from './css-var';

export {
  palette,
  space,
  radius,
  fontFamily,
  fontSize,
  lineHeight,
  fontWeight,
  shadow,
  duration,
  easing,
  control,
  zIndex,
  breakpoint,
} from './primitives';
export { color } from './semantic';
export { CSS_VAR_PREFIX, varName, cssVar } from './css-var';

/** Every token group that is emitted as `--oruwa-<group>-<key>` CSS variables. */
export const tokenGroups = {
  color,
  space,
  radius,
  'font-family': fontFamily,
  'font-size': fontSize,
  'line-height': lineHeight,
  'font-weight': fontWeight,
  shadow,
  duration,
  easing,
  control,
  z: zIndex,
} as const;

/**
 * Flat `{ "--oruwa-color-bg": "#FAF3E7", ... }` map — drives `dist/tokens.css`
 * generation and (Phase 1) the Tailwind `@theme` mapping.
 */
export const flatTokens: Record<string, string> = Object.fromEntries(
  Object.entries(tokenGroups).flatMap(([group, entries]) =>
    Object.entries(entries).map(([key, value]) => [
      `${CSS_VAR_PREFIX}${group}-${String(key).replace(/\./g, '-')}`,
      value as string,
    ]),
  ),
);

/** `breakpoint` is intentionally excluded from `flatTokens` — media-query bounds can't be CSS custom properties. */
export const breakpoints = breakpoint;
