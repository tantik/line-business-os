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
| `color.overlay`          | `rgba(54,43,31,.45)`   | modal/sheet backdrop scrim                   |
| `color.border`           | `#E7D9C1`              | standard border                              |
| `color.border-strong`    | `#D8C6A4`              | emphasised border                            |
| `color.text-primary`     | `#362B1F`              | primary text                                 |
| `color.text-muted`       | `#6B5D48`              | secondary text (AA fix, see below)           |
| `color.text-on-accent`   | `#FFFFFF`              | text on an accent fill                       |
| `color.accent`           | `#4F7A52`              | **fill**: buttons, active states, focus ring |
| `color.accent-text`      | `#3B5C3E`              | **text/icon** accent on light (WCAG AA)      |
| `color.accent-muted`     | `rgba(79,122,82,.12)`  | plaque fills, hover tint                     |
| `color.accent-subtle`    | `rgba(79,122,82,.10)`  | "today" highlight                            |
| `color.danger`           | `#C1503F`              | error border/icon                            |
| `color.danger-text`      | `#A6402F`              | error text                                   |
| `color.danger-muted`     | `rgba(193,80,63,.12)`  | alert fill                                   |
| `color.success`          | `#4F7A52`              | own primitive scale (not an alias of `accent`, see below) |
| `color.success-text`     | `#3B5C3E`              | success text/icon (WCAG AA)                  |
| `color.success-muted`    | `rgba(79,122,82,.12)`  |                                              |
| `color.warning`          | `#B8863B`              | warning **fill** (fails AA as text)          |
| `color.warning-text`     | `#8A5A1F`              | warning text/icon (WCAG AA)                  |
| `color.warning-muted`    | `rgba(184,134,59,.10)` |                                              |
| `color.info`             | `#2F6690`              | info plaques, instructions                   |
| `color.info-text`        | `#2F6690`              | info text/icon (already WCAG AA)             |
| `color.info-muted`       | `rgba(47,102,144,.12)` |                                              |
| `color.focus-ring`       | `#4F7A52`              | focus outline color                          |

## Elevation (semantic role over `shadow.*`)

| Token                | Maps to     | Use                          |
| --------------------- | ----------- | ----------------------------- |
| `elevation.card`      | `shadow.sm` | default card                  |
| `elevation.raised`    | `shadow.md` | hovered/raised card, dropdown |
| `elevation.dropdown`  | `shadow.md` | menu/dropdown panel           |
| `elevation.overlay`   | `shadow.lg` | modal/sheet panel             |

## Focus / state / border

- **focus** — `ring-width` 2px · `ring-offset` 2px (charter §5 — was color-only before)
- **state** — `disabled` 0.5 (opacity applied to any disabled control)
- **border** — `width` 1px (hairline) · `width-thick` 2px

## Scales

- **space** — `px2` 2 · `1` 4 · `2` 8 · `3` 12 · `4` 16 · `5` 20 · `6` 24 · `8` 32 · `10` 40 · `12` 48 · `16` 64 (px)
- **radius** — `sm` 6 · `md` 8 (default) · `lg` 12 · `pill` 999
- **font-family** — `base` `"Noto Sans JP", system-ui, …` · `latin` `"Inter", system-ui, …`
- **font-size** — `xs` .75 · `sm` .8125 · `base` .875 · `md` .9375 · `lg` 1 · `xl` 1.125 · `2xl` 1.25 · `3xl` 1.5 · `4xl` 1.875 (rem)
- **line-height** — `tight` 1.35 · `normal` 1.5 · `relaxed` 1.75
- **font-weight** — `regular` 400 · `medium` 500 · `semibold` 600 · `bold` 700
- **shadow** — `xs` · `sm` (default card) · `md` · `lg` (overlays) — prefer `elevation.*` at call sites
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

## Design System v1 changes (this mission, on top of Phase 0)

Technical audit findings referenced by number (`docs/ai/ORUWA_DESIGN_SYSTEM_TECHNICAL_AUDIT_2026-09-10.md` §4/§6).

1. **`text-muted` AA fix (P0-1)**: `#8B7C64` → `#6B5D48`. Old value was
   ~3.7:1 on ivory / ~4.1:1 on white at the 12-14px sizes it's used at
   (labels, timestamps, `EmptyState`) — below AA's 4.5:1. New value is
   ~5.8:1 / ~6.4:1. This is a visible change everywhere `text-muted` is used
   — flagged for the theme-diff regression check (Phase-0-style) before the
   Operations pilot merges, not silently rolled out.
2. **`success` decoupled from `accent`** (finding K): was a literal alias
   (`success: palette['green-500']` = the same reference as `accent`), so a
   future accent-color change would silently retint every "Saved" toast.
   Now `success`/`success-text`/`success-muted` reference their own
   `success-*` primitives — same hex values today, independent going forward.
3. **`warning-text` / `info-text` / `info-muted` added** (finding K/H):
   `warning` (`#B8863B`) fails AA as text (~2.6:1); `warning-text`
   (`#8A5A1F`) clears it (~5.9:1). `info` (`#2F6690`) already clears AA as
   text, `info-text` names that intent explicitly; `info-muted` is the
   missing tint fill.
4. **`color.overlay` added** (finding H): the modal backdrop scrim
   (`rgba(54,43,31,.45)`) existed only as an inline literal in `Modal.tsx`.
5. **`elevation.*` semantic layer added** (finding B/I): `shadow.*` encoded
   role decisions ("shadow for a card" vs "for an overlay") directly in the
   primitive layer. `elevation.card/raised/dropdown/overlay` map to the same
   `shadow.*` values — no primitive values changed, purely a naming layer.
6. **`focus.ring-width`/`ring-offset`, `state.disabled`, `border.width`/
   `width-thick` tokens added** (finding H): previously only the focus-ring
   *color* was tokenized; width/offset, disabled opacity, and hairline
   border width were all hardcoded per call site.
7. **Drift test strengthened** (finding D): `tokens.test.ts` now computes
   real WCAG contrast ratios for every `-text` color role against both
   `color.bg` and `color.surface`, instead of only pinning
   `accent-text === '#3B5C3E'` as a magic string.
