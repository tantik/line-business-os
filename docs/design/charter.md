# ORUWA Design System — Charter

The principles behind the tokens and components. When a specific value is
needed, `tokens.md` and `packages/tokens` are authoritative; this doc is the
reasoning that must not drift.

## 1. What ORUWA should feel like

A calm, dense, professional Japanese SaaS working tool — not a landing page.
Premium through precision (grid, rhythm, typography, restraint), never through
decoration. One warm light theme, one accent colour. Visual complexity is only
justified when it serves a function.

Reference _principles_ (not sites to copy): the typographic discipline and
detail-level quality of modern B2B products; a fast, legible booking flow;
Japanese compositional discipline (exact grid, considered proportion, quiet
colour) achieved through layout — never through literal motifs (sakura, torii,
etc.).

## 2. Colour

- **Warm light theme only.** Background is warm ivory (`color.bg` `#FAF3E7`),
  deliberately not pure white. Surfaces are white.
- **One accent** — a muted natural green. `color.accent` (`#4F7A52`) is the
  _fill_ (buttons, active states, focus ring). `color.accent-text` (`#3B5C3E`)
  is accent-coloured _text / icons on light_ — it is darker so body-sized text
  clears WCAG AA (4.5:1); `accent` on white is only ~4.4:1.
- Semantic status colours: `danger`, `warning`, `info`, `success` (`success`
  is an intentional alias of `accent`).
- **Category / data-viz colours** (shift-type tones, recipe badges) are a
  _separate contract_ — they live in `apps/web/src/app/(protected)/_ui/workforce-theme.ts`
  and must stay visually distinct from each other and from the semantic status
  colours. Do not fold them into the semantic palette.
- Dark mode is deferred. Trigger to revisit: a paying customer requirement, or
  a Staff-on-the-floor low-light complaint from real use.

## 3. Density

This is a working tool. Prefer density over air, without crowding.

- 4px spacing base. Default control height 40px; **44px minimum tap target**
  (WCAG 2.5.5) for Staff and any mobile viewport.
- Compact type scale; body text is 14px (`font-size.base`).
- Cards and sections carry the _minimum_ padding that keeps grouping legible.

## 4. Motion

- Durations: `duration.fast` 120ms / `duration.base` 160ms / `duration.slow`
  240ms. Nothing animates longer than `slow`.
- Only `opacity`, `transform`, `filter`, `color`, `box-shadow` — never a
  layout-affecting property, so nothing reflows on hover/press.
- Every animation must degrade under `@media (prefers-reduced-motion: reduce)`.
- Micro-interactions should read as refined, not gimmicky. The earlier
  "sliding hand / arrow reveal" button effects are being removed — replace with
  a quiet state change (background/shadow/opacity), not a moving decorative
  element.

## 5. Interaction states

Every interactive element defines all of: rest, hover, active/pressed,
focus-visible (2px `color.focus-ring`, 2px offset), disabled. Nothing may look
"stuck" after a click. Mouse-click focus residue is suppressed
(`:focus:not(:focus-visible)`), real keyboard focus is always visible.

Every data surface defines: loading (skeleton, not spinner-only where layout is
known), empty (guidance + primary action), error (what failed + recovery, no
leaked internals), success.

## 6. Per-role UX

One app, one shell, one visual language. Role changes **density and
interaction weight**, not the look.

| Role        | Device priority                        | Emphasis                                                                                                                                                  |
| ----------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Staff**   | phone → tablet → PC                    | Mobile-first, single column, one primary action per screen, "today" focus, minimal nav (bottom tab bar). Must work inside the LINE in-app browser (LIFF). |
| **Manager** | PC → tablet → phone                    | Operational density: tables, grids, review queues, multi-panel, inline edit. Side navigation on desktop, collapses on tablet, drawer on phone.            |
| **Owner**   | (later — separate cabinet on oruwa.jp) | Overview, analytics, weekly review, drill-down. Read-mostly, few actions (approve/acknowledge). For now Owner === Manager rights and UI.                  |

Manager surfaces are authored desktop-first (base styles = desktop, `max-width`
queries down). Staff surfaces are authored mobile-first (base = phone,
`min-width` queries up).

Shared components take a role/density input rather than being forked. Example:
one "attention item" card — Staff sees only their own items, Manager sees the
location-wide list with assignment controls, Owner sees an aggregated count
linking into the Manager view.

## 7. One platform, many verticals

No tenant-specific or vertical-specific visual fork. Cafe-specific UI is
configuration/presets over shared components. If a vertical seems to need a
different design language, that is a signal to escalate, not to branch the CSS.

## 8. Accessibility baseline

- Text contrast ≥ WCAG AA (4.5:1 body, 3:1 large/UI).
- Full keyboard operability; visible focus; focus trap + restore on overlays.
- Touch targets ≥ 44px on Staff/mobile.
- `prefers-reduced-motion` respected everywhere.
- Japanese-first copy; never machine-translate identifiers or code.
