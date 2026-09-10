# ORUWA Design System

The design system is being built in phases. This directory holds the durable
design docs; the token source of truth is code (`packages/tokens`).

| Doc                      | What it answers                                                                          |
| ------------------------ | ---------------------------------------------------------------------------------------- |
| [charter.md](charter.md) | Principles: palette, density, motion, states, per-role UX, device priorities. The _why_. |
| [tokens.md](tokens.md)   | The token reference — every token, its value, and how to consume it.                     |

## Phase status

- **Phase 0 — Token Foundation** — _in progress._ One token source (`@line-os/tokens`),
  the three legacy token files re-wired onto it, `packages/ui` de-Tailwind'd. No
  visual change beyond the deltas listed in `tokens.md`.
- **Phase 1 — Tailwind v4 + `@line-os/ui`** — component library, `/​_design` gallery.
- **Phase 2 — App shell + role-aware navigation.**
- **Phase 3 — Screen consistency** — rides inside Cafe v2.2 feature work.
- **Phase 4 — Polish** — state coverage, motion, a11y audit.

Out of scope for now: the marketing site (`oruwa-web`, separate repo — consumes
tokens only), the Owner surface, `admin.oruwa.jp`, any second vertical.

## Related governance

`docs/foundation/core-laws-and-product-dna.md` (supreme) → this system must serve
"one platform, many verticals": no tenant-specific visual forks, differences are
configuration. Cafe-specific visuals are presets over shared components, never a
parallel design language.
