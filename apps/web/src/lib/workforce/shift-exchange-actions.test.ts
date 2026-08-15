import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * `shift-exchange-actions.ts`'s Server Actions call `createClient()` /
 * `requireTenantContext()` directly (not designed for dependency injection,
 * same convention as `invitation-actions.test.ts`) -- so `decideShiftExchange`
 * (the canonical Manager decision action added to close the Cafe v2.1
 * Staff-submits/Manager-has-no-UI acceptance gap) has its input-validation
 * and call-ordering properties locked in here as source-text regression
 * guards, mirroring `manager-page-authorization.test.ts`'s approach for the
 * sibling Manager page.
 */
const SOURCE = readFileSync(new URL('./shift-exchange-actions.ts', import.meta.url), 'utf8');
const DECIDE_FN = SOURCE.slice(SOURCE.indexOf('export async function decideShiftExchange'));

test('decideShiftExchange rejects a missing/blank exchangeId before calling requireTenantContext', () => {
  const validationIdx = DECIDE_FN.indexOf("if (typeof exchangeId !== 'string' || !exchangeId) return INVALID_INPUT_RESULT;");
  const contextIdx = DECIDE_FN.indexOf('requireTenantContext()');
  assert.ok(validationIdx >= 0 && contextIdx >= 0);
  assert.ok(validationIdx < contextIdx, 'exchangeId validation must precede any Supabase/tenant-context call');
});

test('decideShiftExchange only accepts decision values "approved" or "rejected"', () => {
  const decisionGuardIdx = DECIDE_FN.indexOf("if (decision !== 'approved' && decision !== 'rejected') return INVALID_INPUT_RESULT;");
  const contextIdx = DECIDE_FN.indexOf('requireTenantContext()');
  assert.ok(decisionGuardIdx >= 0 && contextIdx >= 0);
  assert.ok(decisionGuardIdx < contextIdx, 'decision validation must precede any Supabase/tenant-context call');
});

test('decideShiftExchange calls requireTenantContext (so an unauthenticated/non-member caller is rejected) before writing', () => {
  const contextIdx = DECIDE_FN.indexOf('const tenantContext = await requireTenantContext();');
  const writeIdx = DECIDE_FN.indexOf('decideShiftExchangeWrite(supabase, exchangeId, decision)');
  assert.ok(contextIdx >= 0 && writeIdx >= 0);
  assert.ok(contextIdx < writeIdx, 'tenant context must be resolved before the write call');
});

test('decideShiftExchange short-circuits on a failed tenant context instead of falling through to the write', () => {
  const guardIdx = DECIDE_FN.indexOf("if (tenantContext.status !== 'success') return tenantContext;");
  const writeIdx = DECIDE_FN.indexOf('decideShiftExchangeWrite(supabase, exchangeId, decision)');
  assert.ok(guardIdx >= 0 && guardIdx < writeIdx);
});

test('decideShiftExchange does not resolve a caller-specific staff/employee profile (Manager decision path, not a self-scoped Staff action)', () => {
  assert.ok(
    !/getMyWorkforceStaffProfile/.test(DECIDE_FN),
    'decideShiftExchange must not depend on the caller having their own staff profile -- a Manager deciding another employee\'s request is not self-scoped',
  );
});

test('decideShiftExchange writes exactly once, via the shared decideShiftExchangeWrite (no duplicate/parallel exchange business logic in this action)', () => {
  const occurrences = DECIDE_FN.split('decideShiftExchangeWrite(').length - 1;
  assert.equal(occurrences, 1);
});
