import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Performance Fix Phase 1 - source-text regression guards for the
 * getUser/membership reuse path in `getActiveTenantContext`/`requireTenantContext`.
 * Same convention as `preview/tenant.test.ts` and `preview/actions/authorize.test.ts`:
 * this module's Next.js/Supabase dependencies are not designed for dependency
 * injection, so order-of-operations and reuse properties are locked in as
 * static-source checks here.
 */
const SOURCE = readFileSync(new URL('./context.ts', import.meta.url), 'utf8');

test('getActiveTenantContext accepts an optional pre-resolved user and only calls getUserFromClient when one was not supplied', () => {
  assert.ok(
    /const user = opts\.user \?\? \(await getUserFromClient\(supabase\)\)/.test(SOURCE),
    'getActiveTenantContext must reuse opts.user instead of unconditionally calling getUserFromClient',
  );
  // Exactly one call site in this file - the reuse-aware one above - never a
  // second unconditional call anywhere else in the resolution path.
  const calls = SOURCE.match(/getUserFromClient\(/g) ?? [];
  assert.equal(calls.length, 1, 'getUserFromClient must be called from exactly one place in context.ts');
});

test('getActiveTenantContext accepts optional pre-resolved memberships and only calls listTenantMemberships when none were supplied', () => {
  assert.ok(
    /opts\.memberships\s*\n?\s*\?\s*\(\{ status: 'success', data: opts\.memberships \} as const\)\s*\n?\s*:\s*await listTenantMemberships\(supabase, user\.id\)/.test(
      SOURCE,
    ),
    'getActiveTenantContext must reuse opts.memberships instead of unconditionally calling listTenantMemberships',
  );
  const calls = SOURCE.match(/listTenantMemberships\(/g) ?? [];
  assert.equal(calls.length, 1, 'listTenantMemberships must be called from exactly one place in context.ts');
});

test('requireTenantContext forwards user/memberships through to getActiveTenantContext (does not drop the caller-supplied reuse values)', () => {
  assert.ok(
    /getActiveTenantContext\(\{\s*tenantId:\s*opts\.tenantId,\s*user:\s*opts\.user,\s*memberships:\s*opts\.memberships\s*\}\)/.test(
      SOURCE,
    ),
    'requireTenantContext must pass opts.user and opts.memberships through to getActiveTenantContext',
  );
});

test('the reuse path still fails closed to not_authenticated when no user is resolvable, and to the fresh membership lookup result otherwise (no bypass of the normal outcomes)', () => {
  assert.ok(/if \(!user\) return \{ status: 'not_authenticated' \}/.test(SOURCE));
  assert.ok(/if \(membershipsResult\.status !== 'success'\) return membershipsResult/.test(SOURCE));
});
