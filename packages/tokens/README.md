# @line-os/tokens

The ORUWA design-system token source of truth.

```
src/primitives.ts   raw scales (palette, space, radius, type, shadow, motion, z, breakpoints)
src/semantic.ts     role mapping (color.bg, color.accent, …) — what UI references
src/css-var.ts       cssVar() / varName() helpers for --oruwa-* properties
src/index.ts         public exports + flatTokens (drives CSS generation)
dist/tokens.css     GENERATED, committed — the --oruwa-* custom properties on :root
```

## Consuming

- **CSS pipeline** (Tailwind, CSS Modules): `@import '@line-os/tokens/tokens.css';`
  once (done in `apps/web/src/app/globals.css`), then `var(--oruwa-color-accent)`.
- **TS, bundler or `node --test`**: `import { color, space, radius } from '@line-os/tokens'`
  — literal values, safe without a CSS pipeline.

## Changing a token

1. Edit `src/primitives.ts` (and `src/semantic.ts` if a role changes).
2. `pnpm --filter @line-os/tokens build:css`
3. Commit the regenerated `dist/tokens.css`.
4. `pnpm --filter @line-os/tokens test` — fails if `dist/tokens.css` is stale.

`src/*` must never `import` a `.css` file — this package is loaded by bundler-less
test runners.

See `docs/design/charter.md` and `docs/design/tokens.md`.
