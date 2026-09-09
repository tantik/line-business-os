/**
 * ORUWA design tokens — primitive layer (the single source of truth).
 *
 * Raw, role-agnostic scales. Nothing in the product UI should reference these
 * directly — use the semantic layer (`./semantic.ts`) instead. Values here are
 * literal strings on purpose: this module is imported by plain `node --test`
 * files (no bundler, no CSS pipeline), and the app's `lib/ui/theme.ts` re-reads
 * these literals so the ~250 existing inline-styled call sites keep working
 * unchanged during the Phase 3 migration. The generated `dist/tokens.css`
 * mirrors the same values as CSS custom properties for new Tailwind-based code.
 *
 * Phase 0 rule: values are ported 1:1 from the app's current
 * `apps/web/src/lib/ui/theme.ts` + `apps/web/src/lib/demo/cafe/theme.ts`. The
 * only intentional deltas are recorded in `docs/design/tokens.md` ("Intentional
 * visual changes").
 */

/** Raw palette scale. Named by hue + lightness step, never by role. */
export const palette = {
  'warm-ivory-50': '#FDFBF6',
  'warm-ivory-100': '#FAF3E7',
  'warm-ivory-200': '#F6EEDF',
  'warm-sand-300': '#E7D9C1',
  'warm-sand-400': '#D8C6A4',
  'brown-700': '#8B7C64',
  'brown-900': '#362B1F',
  'green-500': '#4F7A52',
  'green-700': '#3B5C3E',
  'red-500': '#C1503F',
  'red-700': '#A6402F',
  'gold-500': '#B8863B',
  'gold-600': '#C0983F',
  'blue-600': '#2F6690',
  white: '#FFFFFF',
  /** Translucent overlays — computed from the hues above, kept explicit so the value is greppable. */
  'green-a12': 'rgba(79, 122, 82, 0.12)',
  'green-a10': 'rgba(79, 122, 82, 0.10)',
  'red-a12': 'rgba(193, 80, 63, 0.12)',
  'gold-a10': 'rgba(184, 134, 59, 0.10)',
  'brown-a025': 'rgba(54, 43, 31, 0.025)',
} as const;

/** Spacing scale, 4px base. `px2` is the single sub-step (hairline gaps). */
export const space = {
  px2: '2px',
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  8: '32px',
  10: '40px',
  12: '48px',
  16: '64px',
} as const;

export const radius = {
  sm: '6px',
  md: '8px',
  lg: '12px',
  pill: '999px',
} as const;

export const fontFamily = {
  base: '"Noto Sans JP", system-ui, -apple-system, "Segoe UI", sans-serif',
  latin: '"Inter", system-ui, -apple-system, "Segoe UI", sans-serif',
} as const;

export const fontSize = {
  xs: '0.75rem',
  sm: '0.8125rem',
  base: '0.875rem',
  md: '0.9375rem',
  lg: '1rem',
  xl: '1.125rem',
  '2xl': '1.25rem',
  '3xl': '1.5rem',
  '4xl': '1.875rem',
} as const;

export const lineHeight = {
  tight: '1.35',
  normal: '1.5',
  relaxed: '1.75',
} as const;

export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

export const shadow = {
  xs: '0 1px 2px rgba(54, 43, 31, 0.04)',
  sm: '0 1px 2px rgba(54, 43, 31, 0.04), 0 10px 24px rgba(54, 43, 31, 0.05)',
  md: '0 2px 6px rgba(54, 43, 31, 0.12)',
  lg: '0 28px 70px rgba(27, 54, 58, 0.15)',
} as const;

export const duration = {
  fast: '120ms',
  base: '160ms',
  slow: '240ms',
} as const;

export const easing = {
  standard: 'cubic-bezier(0.2, 0, 0, 1)',
  decelerate: 'cubic-bezier(0, 0, 0, 1)',
} as const;

/** Control heights + the WCAG 2.5.5 minimum tap target (Staff / any mobile default). */
export const control = {
  'height-sm': '32px',
  'height-md': '40px',
  'height-lg': '44px',
  'tap-target-min': '44px',
} as const;

export const zIndex = {
  base: '0',
  dropdown: '1000',
  sticky: '1100',
  overlay: '1200',
  modal: '1300',
  toast: '1400',
  tooltip: '1500',
} as const;

/** Reference breakpoints. Manager surfaces are desktop-first (max-width down), Staff surfaces mobile-first (min-width up). */
export const breakpoint = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
} as const;
