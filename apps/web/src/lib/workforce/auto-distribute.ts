/**
 * Auto Scheduling completion mission (2026-09-04): the real implementation
 * moved to `@line-os/workforce` (`packages/workforce/src/auto-distribute.ts`)
 * so `apps/worker`'s scheduled-monthly job can import the exact same engine
 * instead of a second copy. This file is a thin re-export shim -- every
 * existing `./auto-distribute` import site in `apps/web` keeps working
 * unchanged.
 */
export * from '@line-os/workforce/auto-distribute';
