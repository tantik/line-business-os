# ORUWA Design Tokens — Reference

Source of truth: **`packages/tokens`** (`@line-os/tokens`).
`packages/tokens/src/primitives.ts` (raw scales) → `src/semantic.ts` (roles) →
generated `dist/tokens.css` (the `--oruwa-*` custom properties).

## How to consume

| Context                                           | Use                                                                                                        |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| New CSS / CSS Modules / Tailwind arbitrary values | the `--oruwa-*` custom property (loaded once via `apps/web/src/app/globals.css`) or `cssVar('color','bg')` |
| Code imported by `node --test` (no bundler)       | the literal exports: `import { color, space } from '@line-os/tokens'`                                      |
| Existing inline-styled call sites in `apps/web`   | keep using `@/lib/ui/theme` — it now re-exports token values. Migrates to components in Phase 3.           |

Never hard-code a hex/px that a token already covers. To add a value: add the
primitive, map a semantic role if appropriate, run
`pnpm --filter @line-os/tokens build:css`, commit the regenerated `dist/tokens.css`.

## Semantic colour

| Token                    | Value                  | Use                                          |
| ------------------------ | ---------------------- | -------------------------------------------- |
| `color.bg`               | `#FAF3E7`              | page background (warm ivory)                 |
| `color.surface`          | `#FFFFFF`              | cards, inputs, raised surfaces               |
| `color.surface-elevated` | `#F6EEDF`              | nested blocks, disabled fills                |
| `color.surface-sunken`   | `rgba(54,43,31,.025)`  | zebra rows / faintest tint                   |
| `color.border`           | `#E7D9C1`              | standard border                              |
| `color.border-strong`    | `#D8C6A4`              | emphasised border                            |
| `color.text-primary`     | `#362B1F`              | primary text                                 |
| `color.text-muted`       | `#8B7C64`              | secondary text                               |
| `color.text-on-accent`   | `#FFFFFF`              | text on an accent fill                       |
| `color.accent`           | `#4F7A52`              | **fill**: buttons, active states, focus ring |
| `color.accent-text`      | `#3B5C3E`              | **text/icon** accent on light (WCAG AA)      |
| `color.accent-muted`     | `rgba(79,122,82,.12)`  | plaque fills, hover tint                     |
| `color.accent-subtle`    | `rgba(79,122,82,.10)`  | "today" highlight                            |
| `color.danger`           | `#C1503F`              | error border/icon                            |
| `color.danger-text`      | `#A6402F`              | error text                                   |
| `color.danger-muted`     | `rgba(193,80,63,.12)`  | alert fill                                   |
| `color.success`          | `#4F7A52`              | alias of `accent`                            |
| `color.success-muted`    | `rgba(79,122,82,.12)`  |                                              |
| `color.warning`          | `#B8863B`              |                                              |
| `color.warning-muted`    | `rgba(184,134,59,.10)` |                                              |
| `color.info`             | `#2F6690`              | info plaques, instructions                   |
| `color.focus-ring`       | `#4F7A52`              | focus outline (2px, 2px offset)              |

## Scales

- **space** — `px2` 2 · `1` 4 · `2` 8 · `3` 12 · `4` 16 · `5` 20 · `6` 24 · `8` 32 · `10` 40 · `12` 48 · `16` 64 (px)
- **radius** — `sm` 6 · `md` 8 (default) · `lg` 12 · `pill` 999
- **font-family** — `base` `"Noto Sans JP", system-ui, …` · `latin` `"Inter", system-ui, …`
- **font-size** — `xs` .75 · `sm` .8125 · `base` .875 · `md` .9375 · `lg` 1 · `xl` 1.125 · `2xl` 1.25 · `3xl` 1.5 · `4xl` 1.875 (rem)
- **line-height** — `tight` 1.35 · `normal` 1.5 · `relaxed` 1.75
- **font-weight** — `regular` 400 · `medium` 500 · `semibold` 600 · `bold` 700
- **shadow** — `xs` · `sm` (default card) · `md` · `lg` (overlays)
- **duration** — `fast` 120ms · `base` 160ms · `slow` 240ms
- **easing** — `standard` `cubic-bezier(.2,0,0,1)` · `decelerate` `cubic-bezier(0,0,0,1)`
- **control** — `height-sm` 32 · `height-md` 40 · `height-lg` 44 · `tap-target-min` 44 (px)
- **z** — `dropdown` 1000 · `sticky` 1100 · `overlay` 1200 · `modal` 1300 · `toast` 1400 · `tooltip` 1500
- **breakpoint** (JS only, not a CSS var) — `sm` 640 · `md` 768 · `lg` 1024 · `xl` 1280 (px)

## Intentional visual changes in Phase 0

Everything else is byte-identical to the pre-Phase-0 palette. These are the
exceptions (each reviewed):

1. **Accent text / links on light**: `#4F7A52` → `#3B5C3E` (`color.accent-text`).
   Contrast 4.4:1 → 7.0:1. Applied where `@/lib/ui/theme` exposes `accentText`
   and in `demoColors.accentStrong`.
2. **Body font**: `system-ui, sans-serif` → `"Noto Sans JP", system-ui, …`.
   Consistent Japanese glyphs instead of whatever the OS picks.
3. **`packages/ui` Button/Card**: dropped dead Tailwind `emerald`/`gray`
   classes, restyled from tokens. These components are barely rendered today
   but no longer contradict the theme.
4. Odd literals normalised where a token replaced them: `packages/ui` card
   padding `18` → `space.5` (20); shared button heights → `control.height-lg`.

Not yet touched (later phases): the ~250 inline-styled `<button>` call sites,
`lib/ui/theme.module.css` decorative reveal effects, per-screen CSS Modules.
