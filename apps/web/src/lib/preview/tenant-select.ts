import type { TenantMembership } from '@/lib/tenant/types';

/**
 * Pure membership selection: find the caller's active membership for the
 * given tenant slug, if any. No I/O, fully unit-testable.
 *
 * Deliberately does not fall back to any other membership - an active
 * membership for a *different* tenant must never be treated as a match here.
 * The slug is always supplied by the caller; there is no built-in default
 * tenant.
 *
 * Kept in its own module (no `server-only` import) so it can be unit tested
 * directly under the plain `node:test` runner, which has no Next.js webpack
 * shim for the `server-only` sentinel package.
 */
export function selectPreviewMembership(memberships: TenantMembership[], slug: string): TenantMembership | null {
  return memberships.find((m) => m.tenantSlug === slug && m.status === 'active') ?? null;
}
