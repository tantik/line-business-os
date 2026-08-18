/**
 * Thin re-export shim: the real implementation lives at
 * `@/components/shared/design-kit` (promoted so any module/package can reuse
 * it, not just the Cafe demo). Prop-compatible with every existing call site
 * in this package, so nothing under `apps/web/src/lib/preview/**` or
 * `apps/web/src/components/demo/cafe/**` needs to change.
 */
export { ConfirmDialog } from '@/components/shared/design-kit';
