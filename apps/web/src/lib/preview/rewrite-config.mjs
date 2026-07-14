/**
 * Phase 1N-4C Slice B1 - pure rewrite-rule data for the `preview.oruwa.jp`
 * host-based routing contract (architecture plan Section D.3/E).
 *
 * Plain ESM (not TypeScript) so `next.config.mjs` can import it directly at
 * config-load time, before any TS/SWC pipeline runs. The same file is also
 * imported by `rewrite-config.test.ts` (via `node --import tsx --test`, which
 * loads plain `.mjs` unchanged), so the reviewable contract and the config
 * actually used by Next.js can never drift apart.
 */

/** The only host this rewrite applies to; every other host is unaffected. */
export const PREVIEW_HOST = 'preview.oruwa.jp';

/** Public source path family the rewrite intercepts (unauthenticated on every other host). */
export const PREVIEW_SOURCE_BASE = '/mame-to-cha';

/** Internal destination the rewrite targets - never linked to from any page. */
export const PREVIEW_DESTINATION_BASE = '/_client-preview/mame-to-cha';

/**
 * `beforeFiles` rewrite rules for the Mame To Cha preview host.
 *
 * `beforeFiles` is required (not `afterFiles`/`fallback`) because
 * `/mame-to-cha/*` already matches a physical page
 * (`apps/web/src/app/mame-to-cha/*`, the public frontend-only demo) on every
 * host - `beforeFiles` is the only rewrite phase that can override a physical
 * route match conditionally, host-by-host.
 */
export function buildPreviewRewrites() {
  return [
    {
      source: PREVIEW_SOURCE_BASE,
      has: [{ type: 'host', value: PREVIEW_HOST }],
      destination: PREVIEW_DESTINATION_BASE,
    },
    {
      source: `${PREVIEW_SOURCE_BASE}/:path*`,
      has: [{ type: 'host', value: PREVIEW_HOST }],
      destination: `${PREVIEW_DESTINATION_BASE}/:path*`,
    },
  ];
}
