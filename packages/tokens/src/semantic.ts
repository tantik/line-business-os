/**
 * ORUWA design tokens — semantic layer.
 *
 * This is what product UI references (directly in Phase 1+ via Tailwind, or
 * indirectly today via `apps/web/src/lib/ui/theme.ts`). Each entry maps a role
 * to a primitive. Never introduce a raw hex here — add it to `./primitives.ts`
 * first.
 */
import { palette, shadow, focusRing, opacity, borderWidth } from './primitives';

export const color = {
  /** Page background — warm ivory, deliberately not pure white. */
  bg: palette['warm-ivory-100'],
  /** Cards, inputs, any raised surface. */
  surface: palette.white,
  /** Nested blocks, disabled control fills. */
  'surface-elevated': palette['warm-ivory-200'],
  /** Zebra rows / the faintest possible tint. */
  'surface-sunken': palette['brown-a025'],
  /** Modal/sheet backdrop scrim. */
  overlay: palette['brown-a045'],

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

  /**
   * Own primitive scale, not an alias of `accent` (audit finding K) — a
   * future accent-color change no longer silently retints "Saved" toasts.
   * Same value as `accent`/`accent-text` today by deliberate choice.
   */
  success: palette['success-500'],
  'success-text': palette['success-700'],
  'success-muted': palette['success-a12'],

  warning: palette['gold-500'],
  /** AA-safe text/icon color for warning content — `warning` itself (gold-500) fails AA as text (~2.6:1). */
  'warning-text': palette['gold-700'],
  'warning-muted': palette['gold-a10'],

  info: palette['blue-600'],
  /** `info` (blue-600) already clears AA (~6.1:1) as text; named separately so call sites read intent, matching the other tone pairs. */
  'info-text': palette['blue-600'],
  'info-muted': palette['blue-a12'],

  'focus-ring': palette['green-500'],
} as const;

/**
 * Semantic elevation roles — `shadow.*` previously encoded role decisions
 * directly in the primitive layer (audit finding B/I: "shadow for a card" vs
 * "shadow for an overlay" is a role choice, not a raw scale value). Primitive
 * `shadow` values are unchanged; this is purely a naming/role layer on top.
 */
export const elevation = {
  card: shadow.sm,
  raised: shadow.md,
  dropdown: shadow.md,
  overlay: shadow.lg,
} as const;

/** Re-exported under semantic names so `packages/ui` never imports the primitive layer directly for these. */
export const focus = {
  'ring-width': focusRing.width,
  'ring-offset': focusRing.offset,
} as const;

export const state = {
  disabled: opacity.disabled,
} as const;

export const border = {
  width: borderWidth.hairline,
  'width-thick': borderWidth.thick,
} as const;
