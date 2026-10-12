/**
 * Auto Scheduling completion mission (2026-09-04): the real implementation
 * moved to `@line-os/workforce` (`packages/workforce/src/auto-distribute.ts`)
 * so the scheduled-monthly job (now the `auto-schedule-monthly` Edge Function,
 * via a generated, drift-guarded copy) runs the exact same engine instead of
 * a second implementation. This file is a thin re-export shim -- every
 * existing `./auto-distribute` import site in `apps/web` keeps working
 * unchanged.
 */
export * from '@line-os/workforce/auto-distribute';
