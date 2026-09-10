/**
 * ORUWA design tokens — semantic layer.
 *
 * This is what product UI references (directly in Phase 1+ via Tailwind, or
 * indirectly today via `apps/web/src/lib/ui/theme.ts`). Each entry maps a role
 * to a primitive. Never introduce a raw hex here — add it to `./primitives.ts`
 * first.
 */
import { palette } from './primitives';

export const color = {
  /** Page background — warm ivory, deliberately not pure white. */
  bg: palette['warm-ivory-100'],
  /** Cards, inputs, any raised surface. */
  surface: palette.white,
  /** Nested blocks, disabled control fills. */
  'surface-elevated': palette['warm-ivory-200'],
  /** Zebra rows / the faintest possible tint. */
  'surface-sunken': palette['brown-a025'],

  border: palette['warm-sand-300'],
  'border-strong': palette['warm-sand-400'],

  'text-primary': palette['brown-900'],
  'text-muted': palette['brown-700'],
  'text-on-accent': palette.white,

  /** Accent FILL — buttons, active states, the focus ring. */
  accent: palette['green-500'],
  /**
   * Accent TEXT — links, accent-colored text/icons on a light surface.
   * Darker than `accent` so it clears WCAG AA (4.5:1) as body-sized text;
   * `accent` on white is only ~4.4:1.
   */
  'accent-text': palette['green-700'],
  'accent-muted': palette['green-a12'],
  'accent-subtle': palette['green-a10'],

  danger: palette['red-500'],
  'danger-text': palette['red-700'],
  'danger-muted': palette['red-a12'],

  /** Alias of `accent` — kept as its own name so "success" reads intentionally at call sites. */
  success: palette['green-500'],
  'success-muted': palette['green-a12'],

  warning: palette['gold-500'],
  'warning-muted': palette['gold-a10'],

  info: palette['blue-600'],

  'focus-ring': palette['green-500'],
} as const;
