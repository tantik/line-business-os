/**
 * Phase 1N-4C Slice B1 - shared constants for the Mame To Cha DB-backed
 * preview shell. See `docs/phase-1n-4c-mame-to-cha-db-preview-architecture-plan.md`
 * Section F1/D.6 for why the tenant slug is a fixed constant here (never read
 * from the URL or any client input - the preview shell is single-tenant by
 * construction) and Section B10 for why this is a distinct tenant from the
 * seeded `mame-to-cha-tokyo` sales-demo tenant (never touched by this slice).
 */

/** The acceptance tenant's real `core.tenants.slug` - not a manufactured variant. */
export const PREVIEW_TENANT_SLUG = 'mame-to-cha';

/** Public, client-facing route base. The internal rewrite-destination path is a plain data constant in `rewrite-config.mjs` (`PREVIEW_DESTINATION_BASE`) - the single source of truth, since no page ever needs to link to it. */
export const PREVIEW_BASE_PATH = '/mame-to-cha';

/** The only module this preview slice gates on. */
export const PREVIEW_MODULE = 'workforce';
