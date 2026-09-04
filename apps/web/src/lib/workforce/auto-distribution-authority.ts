/**
 * Auto Scheduling completion mission (2026-09-04): moved to
 * `@line-os/workforce` alongside `auto-distribute.ts` -- see that file's
 * shim header for why. Thin re-export shim; every existing
 * `./auto-distribution-authority` import site in `apps/web` keeps working
 * unchanged.
 */
export * from '@line-os/workforce/auto-distribution-authority';
