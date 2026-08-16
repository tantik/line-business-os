import type { TenantMembership } from '@/lib/tenant/types';
import { PREVIEW_TENANT_SLUG } from './constants';

/**
 * Pure membership selection: find the caller's active membership for the
 * fixed preview tenant slug, if any. No I/O, fully unit-testable.
 *
 * Deliberately does not fall back to any other membership - an active
 * membership for a *different* tenant must never be treated as a match here.
 *
 * Kept in its own module (no `server-only` import, unlike `tenant.ts`) so it
 * can be unit tested directly under the plain `node:test` runner, which has
 * no Next.js webpack shim for the `server-only` sentinel package.
 */
export function selectPreviewMembership(
  memberships: TenantMembership[],
  slug: string = PREVIEW_TENANT_SLUG,
): TenantMembership | null {
  return memberships.find((m) => m.tenantSlug === slug && m.status === 'active') ?? null;
}
