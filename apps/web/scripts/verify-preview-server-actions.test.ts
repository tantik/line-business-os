import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeRouteKey,
  isPreviewRoute,
  matchesAnySuffix,
  collectActionEntries,
  evaluateManifestEntries,
} from './verify-preview-server-actions.mjs';

/**
 * Phase 1N-4C Slice B2a - regression coverage for the manifest verifier's
 * pure logic, using synthetic fixtures. Does NOT read the real `.next`
 * folder (that is `verify:preview-actions`'s job, run post-build) - these
 * tests exist specifically to lock in the route-key-normalization bug found
 * during review: the manifest's real preview route keys use the plain,
 * already-decoded `app/_client-preview/...` form, not the percent-encoded
 * `app/%5Fclient-preview/...` form a prior draft of this script assumed,
 * which made every preview-route check silently vacuous (zero entries ever
 * matched `isPreviewRoute`, so the allowlist/forbidden-module checks always
 * "passed" trivially, without ever inspecting a single real entry).
 */

function actionEntry(overrides: Partial<{ runtime: 'node' | 'edge'; exportedName: string; filename: string; workers: Record<string, unknown> }> = {}) {
  return {
    runtime: 'node' as const,
    exportedName: 'someAction',
    filename: 'src/lib/preview/actions/staff-actions.ts',
    workers: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// normalizeRouteKey / isPreviewRoute - route-key format
// ---------------------------------------------------------------------------

test('normalizeRouteKey folds the percent-encoded private-folder escape to a plain underscore', () => {
  assert.equal(normalizeRouteKey('app/%5Fclient-preview/mame-to-cha/manager/page'), 'app/_client-preview/mame-to-cha/manager/page');
  assert.equal(normalizeRouteKey('app/%5fclient-preview/mame-to-cha/manager/page'), 'app/_client-preview/mame-to-cha/manager/page');
});

test('normalizeRouteKey is a no-op for a key that is already in the decoded form', () => {
  assert.equal(normalizeRouteKey('app/_client-preview/mame-to-cha/manager/page'), 'app/_client-preview/mame-to-cha/manager/page');
});

test('isPreviewRoute recognizes the actual manifest format (plain underscore, confirmed against a real build)', () => {
  assert.ok(isPreviewRoute('app/_client-preview/mame-to-cha/manager/page'));
  assert.ok(isPreviewRoute('app/_client-preview/mame-to-cha/page'));
  assert.ok(isPreviewRoute('app/_client-preview/mame-to-cha/staff/page'));
});

test('isPreviewRoute also recognizes the percent-encoded form, defensively, in case a different Next.js version emits it', () => {
  assert.ok(isPreviewRoute('app/%5Fclient-preview/mame-to-cha/manager/page'));
});

test('isPreviewRoute does not match a dashboard or unrelated route', () => {
  assert.ok(!isPreviewRoute('app/(protected)/dashboard/workforce/manager/page'));
  assert.ok(!isPreviewRoute('app/mame-to-cha/manager/page'));
});

// ---------------------------------------------------------------------------
// matchesAnySuffix - Windows vs POSIX path separators
// ---------------------------------------------------------------------------

test('matchesAnySuffix matches a Windows-backslash filename against a POSIX suffix', () => {
  const filename = '..\\D:\\Dev\\line-business-os\\apps\\web\\src\\lib\\workforce\\staff-actions.ts';
  assert.ok(matchesAnySuffix(filename, ['lib/workforce/staff-actions.ts']));
});

test('matchesAnySuffix matches a POSIX filename unchanged', () => {
  const filename = '../D:/Dev/line-business-os/apps/web/src/lib/workforce/staff-actions.ts';
  assert.ok(matchesAnySuffix(filename, ['lib/workforce/staff-actions.ts']));
});

test('matchesAnySuffix does not match the preview wrapper of the same basename under lib/preview/actions', () => {
  const filename = '../D:/Dev/line-business-os/apps/web/src/lib/preview/actions/staff-actions.ts';
  assert.ok(!matchesAnySuffix(filename, ['lib/workforce/staff-actions.ts']));
});

// ---------------------------------------------------------------------------
// collectActionEntries - manifest shape / fail-closed on unknown schema
// ---------------------------------------------------------------------------

test('collectActionEntries flattens node and edge runtime tables', () => {
  const manifest = {
    node: { a1: { exportedName: 'foo', filename: 'x.ts', workers: { r1: {} } } },
    edge: { a2: { exportedName: 'bar', filename: 'y.ts', workers: {} } },
  };
  const entries = collectActionEntries(manifest);
  assert.equal(entries.length, 2);
  assert.ok(entries.some((e) => e.runtime === 'node' && e.exportedName === 'foo'));
  assert.ok(entries.some((e) => e.runtime === 'edge' && e.exportedName === 'bar'));
});

test('collectActionEntries tolerates a missing runtime table (treats as zero entries for that runtime)', () => {
  const entries = collectActionEntries({ node: {} });
  assert.deepEqual(entries, []);
});

test('collectActionEntries fails closed (throws) on a non-object manifest root', () => {
  assert.throws(() => collectActionEntries(null));
  assert.throws(() => collectActionEntries('not an object'));
});

test('collectActionEntries fails closed (throws) when a runtime table is present but not an object', () => {
  assert.throws(() => collectActionEntries({ node: 'not an object' }));
});

test('collectActionEntries fails closed (throws) when an entry is missing exportedName/filename', () => {
  assert.throws(() => collectActionEntries({ node: { a1: { workers: {} } } }));
});

// ---------------------------------------------------------------------------
// evaluateManifestEntries - allowlist / zero-action / forbidden-module / positive-control rules
// ---------------------------------------------------------------------------

test('manager preview route accepts exactly the currently-allowlisted actions and nothing else', () => {
  const allowed = [
    'previewUpsertEmployee',
    'previewSetEmployeeActive',
    'previewCreateShiftAssignment',
    'previewUpdateShiftAssignment',
    'previewRunAutoDistribution',
    'previewPublishSchedule',
    'previewDecideCorrectionRequest',
    'previewSetRecipeContentKind',
    'previewSaveScheduleSettings',
    'previewUpsertShiftType',
    'previewSetShiftTypeActive',
    'previewUpsertInventoryItem',
    'previewSetInventoryItemActive',
    'previewDecideShiftExchange',
    'previewSignOut',
  ];
  const entries = allowed.map((exportedName) =>
    actionEntry({
      exportedName,
      filename: 'src/lib/preview/actions/staff-actions.ts',
      workers: { 'app/_client-preview/mame-to-cha/manager/page': {} },
    }),
  );
  const result = evaluateManifestEntries(entries);
  assert.deepEqual(result.allowlistViolations, []);
  assert.deepEqual(result.forbiddenModuleViolations, []);
  assert.deepEqual(result.unknownRouteViolations, []);
});

test('manager preview route rejects a twelfth, non-allowlisted action name', () => {
  const entries = [
    actionEntry({
      exportedName: 'previewSomethingElse',
      filename: 'src/lib/preview/actions/staff-actions.ts',
      workers: { 'app/_client-preview/mame-to-cha/manager/page': {} },
    }),
  ];
  const result = evaluateManifestEntries(entries);
  assert.equal(result.allowlistViolations.length, 1);
  assert.equal(result.allowlistViolations[0]?.exportedName, 'previewSomethingElse');
});

test('legacy staff and recipe-detail routes reject actions while recipes allows sign-out only', () => {
  for (const route of [
    'app/_client-preview/mame-to-cha/staff/page',
    'app/_client-preview/mame-to-cha/recipes/[recipeId]/page',
  ]) {
    const entries = [actionEntry({ exportedName: 'previewSubmitShiftPreference', workers: { [route]: {} } })];
    const result = evaluateManifestEntries(entries);
    assert.equal(result.allowlistViolations.length, 1, `expected a violation for route ${route}`);
  }
  const recipesResult = evaluateManifestEntries([
    actionEntry({
      exportedName: 'previewSignOut',
      filename: '../src/lib/preview/actions/session-actions.ts',
      workers: { 'app/_client-preview/mame-to-cha/recipes/page': {} },
    }),
  ]);
  assert.deepEqual(recipesResult.allowlistViolations, []);
});

test('staff preview route accepts exactly the currently allowlisted actions and nothing else', () => {
  const allowed = [
    'previewSubmitShiftPreference',
    'previewSubmitWorkReport',
    'previewClockIn',
    'previewClockOut',
    'previewResetTodayClock',
    'previewSubmitCorrectionRequest',
    'previewSubmitInventoryStockCount',
    'previewRequestShiftExchange',
    'previewAcceptShiftExchange',
    'previewCancelShiftExchange',
    'previewStartInventorySession',
    'previewRecordInventorySessionItem',
    'previewCompleteInventorySession',
    'previewSignOut',
  ];
  const entries = allowed.map((exportedName) =>
    actionEntry({
      exportedName,
      filename: 'src/lib/preview/actions/schedule-actions.ts',
      workers: { 'app/_client-preview/mame-to-cha/page': {} },
    }),
  );
  const result = evaluateManifestEntries(entries);
  assert.deepEqual(result.allowlistViolations, []);
  assert.deepEqual(result.forbiddenModuleViolations, []);
  assert.deepEqual(result.unknownRouteViolations, []);
});

test('staff preview route permits a partial allowed set (exact completeness is covered by static import checks)', () => {
  const partialAllowed = ['previewSubmitShiftPreference', 'previewSubmitWorkReport'].map((exportedName) =>
    actionEntry({ exportedName, workers: { 'app/_client-preview/mame-to-cha/page': {} } }),
  );
  const result = evaluateManifestEntries(partialAllowed);
  assert.deepEqual(result.allowlistViolations, []);
});

test('staff preview route rejects a fourth, unknown B2b-shaped action name', () => {
  const entries = [
    actionEntry({ exportedName: 'previewSubmitSomethingElse', workers: { 'app/_client-preview/mame-to-cha/page': {} } }),
  ];
  const result = evaluateManifestEntries(entries);
  assert.equal(result.allowlistViolations.length, 1);
  assert.equal(result.allowlistViolations[0]?.exportedName, 'previewSubmitSomethingElse');
});

test('a B2a manager action registered as a worker for the staff route is an allowlist violation (roles are not interchangeable)', () => {
  const entries = [actionEntry({ exportedName: 'previewUpsertEmployee', workers: { 'app/_client-preview/mame-to-cha/page': {} } })];
  const result = evaluateManifestEntries(entries);
  assert.equal(result.allowlistViolations.length, 1);
});

test('a B2b staff action registered as a worker for the manager route is an allowlist violation (roles are not interchangeable)', () => {
  const entries = [
    actionEntry({ exportedName: 'previewSubmitShiftPreference', workers: { 'app/_client-preview/mame-to-cha/manager/page': {} } }),
  ];
  const result = evaluateManifestEntries(entries);
  assert.equal(result.allowlistViolations.length, 1);
});

test('a raw dashboard action module registered as a worker for a preview route is a forbidden-module violation, not merely an allowlist violation', () => {
  const entries = [
    actionEntry({
      exportedName: 'upsertEmployee',
      filename: '../D:\\Dev\\line-business-os\\apps\\web\\src\\lib\\workforce\\staff-actions.ts',
      workers: { 'app/_client-preview/mame-to-cha/manager/page': {} },
    }),
  ];
  const result = evaluateManifestEntries(entries);
  assert.equal(result.forbiddenModuleViolations.length, 1);
  assert.deepEqual(result.allowlistViolations, []);
});

test('the LINE bind action module registered as a worker for any preview route is a forbidden-module violation', () => {
  const entries = [
    actionEntry({
      exportedName: 'bindEmployeeLineUser',
      filename: '../D:\\Dev\\line-business-os\\apps\\web\\src\\lib\\workforce\\employee-line-links.ts',
      workers: { 'app/_client-preview/mame-to-cha/manager/page': {} },
    }),
  ];
  const result = evaluateManifestEntries(entries);
  assert.equal(result.forbiddenModuleViolations.length, 1);
});

test('an unrecognized preview route (not in any allowlist) is its own violation category, failing closed', () => {
  const entries = [actionEntry({ exportedName: 'previewUpsertEmployee', workers: { 'app/_client-preview/mame-to-cha/unknown-route/page': {} } })];
  const result = evaluateManifestEntries(entries);
  assert.equal(result.unknownRouteViolations.length, 1);
  assert.deepEqual(result.allowlistViolations, []);
});

test('dashboard positive control passes when both dashboard mutation routes have at least one Workforce mutation worker', () => {
  const entries = [
    actionEntry({
      exportedName: 'upsertEmployee',
      filename: '../D:\\Dev\\line-business-os\\apps\\web\\src\\lib\\workforce\\staff-actions.ts',
      workers: { 'app/(protected)/dashboard/workforce/manager/page': {} },
    }),
    actionEntry({
      exportedName: 'submitWorkReport',
      filename: '../D:\\Dev\\line-business-os\\apps\\web\\src\\lib\\workforce\\attendance-actions.ts',
      workers: {
        'app/(protected)/dashboard/workforce/manager/page': {},
        'app/(protected)/dashboard/workforce/staff/page': {},
      },
    }),
  ];
  const result = evaluateManifestEntries(entries);
  assert.deepEqual(result.missingDashboardCoverage, []);
});

test('dashboard positive control fails when a dashboard mutation route has no Workforce mutation worker (this is the exact bug class this review was asked to catch)', () => {
  const entries: ReturnType<typeof actionEntry>[] = [];
  const result = evaluateManifestEntries(entries);
  assert.deepEqual(result.missingDashboardCoverage, [
    'app/(protected)/dashboard/workforce/manager/page',
    'app/(protected)/dashboard/workforce/staff/page',
  ]);
});

test('dashboard positive control is not satisfied by a preview action module of the same basename (lib/preview/actions vs lib/workforce)', () => {
  const entries = [
    actionEntry({
      exportedName: 'previewUpsertEmployee',
      filename: '../D:\\Dev\\line-business-os\\apps\\web\\src\\lib\\preview\\actions\\staff-actions.ts',
      workers: { 'app/(protected)/dashboard/workforce/manager/page': {} },
    }),
  ];
  const result = evaluateManifestEntries(entries);
  assert.ok(result.missingDashboardCoverage.includes('app/(protected)/dashboard/workforce/manager/page'));
});
