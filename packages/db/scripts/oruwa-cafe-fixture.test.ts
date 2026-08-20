import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ORUWA_CAFE_FIXTURE,
  ORUWA_CAFE_TENANT_SLUG,
  FIXTURE_ITEM_MARKERS,
  buildOruwaCafeFixturePlan,
  type OruwaCafeFixtureContext,
} from './oruwa-cafe-fixture.js';

const EMPLOYEE_IDS = ['emp-a', 'emp-b', 'emp-c'] as const;

function baseContext(overrides: Partial<OruwaCafeFixtureContext> = {}): OruwaCafeFixtureContext {
  return {
    tenantId: 'tenant-1',
    locationId: 'loc-1',
    timeZone: 'Asia/Tokyo',
    todayIso: '2026-08-20',
    activeEmployeeIds: EMPLOYEE_IDS,
    existingInventoryItemNames: [],
    alreadySeeded: {
      unavailableConflict: false,
      pendingCorrectionPast: false,
      pendingCorrectionFuture: false,
      pendingShiftExchange: false,
    },
    ...overrides,
  };
}

test('ORUWA_CAFE_TENANT_SLUG is the exact expected slug', () => {
  assert.equal(ORUWA_CAFE_TENANT_SLUG, 'oruwa-cafe');
});

test('buildOruwaCafeFixturePlan produces one unavailable-conflict preference + assignment pair on the manifest employee/date', () => {
  const plan = buildOruwaCafeFixturePlan(ORUWA_CAFE_FIXTURE, baseContext());

  const preference = plan.shiftRequestInserts.find((r) => r.requestKind === 'preference');
  assert.ok(preference);
  assert.equal(preference.employeeId, EMPLOYEE_IDS[ORUWA_CAFE_FIXTURE.unavailableConflict.employeeIndex]);
  assert.equal(preference.isUnavailable, true);
  assert.equal(preference.status, 'pending');
  assert.equal(preference.workDateIso, '2026-08-23'); // todayIso + 3

  const assignment = plan.shiftAssignmentInserts.find((a) => a.notes === FIXTURE_ITEM_MARKERS.unavailableConflict);
  assert.ok(assignment);
  assert.equal(assignment.employeeId, preference.employeeId);
  assert.equal(assignment.workDateIso, preference.workDateIso);
  assert.equal(assignment.published, true);
});

test('buildOruwaCafeFixturePlan seeds the past-day correction with a negative offset resolved against todayIso', () => {
  const plan = buildOruwaCafeFixturePlan(ORUWA_CAFE_FIXTURE, baseContext({ todayIso: '2026-08-20' }));
  const correction = plan.shiftRequestInserts.find(
    (r) => r.requestKind === 'correction' && r.workDateIso < '2026-08-20',
  );
  assert.ok(correction);
  assert.equal(correction.workDateIso, '2026-08-18'); // todayIso - 2
  assert.equal(correction.status, 'pending');
  assert.equal((correction.details as { qaFixtureMarker?: string }).qaFixtureMarker, FIXTURE_ITEM_MARKERS.pendingCorrectionPast);
});

test('buildOruwaCafeFixturePlan seeds a separate future-day correction, not the same row as the past one', () => {
  const plan = buildOruwaCafeFixturePlan(ORUWA_CAFE_FIXTURE, baseContext());
  const corrections = plan.shiftRequestInserts.filter((r) => r.requestKind === 'correction');
  assert.equal(corrections.length, 2);
  assert.notEqual(corrections[0]!.workDateIso, corrections[1]!.workDateIso);
  assert.ok(corrections.some((c) => c.workDateIso > '2026-08-20'));
  assert.ok(corrections.some((c) => c.workDateIso < '2026-08-20'));
});

test('buildOruwaCafeFixturePlan links the shift-exchange insert to its own freshly planned assignment via a shared marker', () => {
  const plan = buildOruwaCafeFixturePlan(ORUWA_CAFE_FIXTURE, baseContext());
  const exchange = plan.shiftExchangeInserts[0];
  assert.ok(exchange);
  const linkedAssignment = plan.shiftAssignmentInserts.find((a) => a.notes === exchange.linkedAssignmentMarker);
  assert.ok(linkedAssignment);
  assert.equal(linkedAssignment.employeeId, exchange.requesterEmployeeId);
  assert.equal(exchange.status, 'open');
  assert.equal(exchange.requestKind, 'exchange');
});

test('the manifest\'s pendingShiftExchange.reason actually contains its own item marker (regression: a rerun must be able to detect this fixture from reason text alone)', () => {
  assert.ok(
    ORUWA_CAFE_FIXTURE.pendingShiftExchange.reason.includes(FIXTURE_ITEM_MARKERS.pendingShiftExchange),
    'reason text must include FIXTURE_ITEM_MARKERS.pendingShiftExchange, not just the bare FIXTURE_OWNERSHIP_MARKER, or the executor\'s alreadySeeded check silently always misses and duplicates this fixture on every rerun',
  );
});

test('buildOruwaCafeFixturePlan plans both inventory items when neither exists yet', () => {
  const plan = buildOruwaCafeFixturePlan(ORUWA_CAFE_FIXTURE, baseContext());
  assert.equal(plan.inventoryItemInserts.length, 2);
  const shortage = plan.inventoryItemInserts.find((i) => i.name === ORUWA_CAFE_FIXTURE.inventoryShortageItem.name);
  assert.ok(shortage);
  assert.equal(shortage.initialActualQuantity, ORUWA_CAFE_FIXTURE.inventoryShortageItem.actualQuantity);
  const uncounted = plan.inventoryItemInserts.find((i) => i.name === ORUWA_CAFE_FIXTURE.inventoryUncountedItem.name);
  assert.ok(uncounted);
  assert.equal(uncounted.initialActualQuantity, undefined);
});

test('buildOruwaCafeFixturePlan skips an inventory item whose name already exists, without erroring', () => {
  const plan = buildOruwaCafeFixturePlan(
    ORUWA_CAFE_FIXTURE,
    baseContext({ existingInventoryItemNames: [ORUWA_CAFE_FIXTURE.inventoryShortageItem.name] }),
  );
  assert.equal(plan.inventoryItemInserts.length, 1);
  assert.equal(plan.inventoryItemInserts[0]!.name, ORUWA_CAFE_FIXTURE.inventoryUncountedItem.name);
  assert.ok(plan.skipped.some((s) => s.includes('inventoryShortageItem')));
});

test('buildOruwaCafeFixturePlan is idempotent: every alreadySeeded flag set to true plans nothing but inventory (rerun-safety)', () => {
  const plan = buildOruwaCafeFixturePlan(
    ORUWA_CAFE_FIXTURE,
    baseContext({
      alreadySeeded: {
        unavailableConflict: true,
        pendingCorrectionPast: true,
        pendingCorrectionFuture: true,
        pendingShiftExchange: true,
      },
    }),
  );
  assert.equal(plan.shiftRequestInserts.length, 0);
  assert.equal(plan.shiftAssignmentInserts.length, 0);
  assert.equal(plan.shiftExchangeInserts.length, 0);
  assert.equal(plan.skipped.length, 4);
});

test('buildOruwaCafeFixturePlan skips (never throws) when the manifest references an employee index beyond the tenant\'s active roster', () => {
  const plan = buildOruwaCafeFixturePlan(ORUWA_CAFE_FIXTURE, baseContext({ activeEmployeeIds: [] }));
  assert.equal(plan.shiftRequestInserts.length, 0);
  assert.equal(plan.shiftAssignmentInserts.length, 0);
  assert.equal(plan.shiftExchangeInserts.length, 0);
  assert.ok(plan.skipped.some((s) => s.includes('no active employee at index')));
});

test('buildOruwaCafeFixturePlan is deterministic: the same manifest+context produces byte-identical output across two calls', () => {
  const context = baseContext();
  const planA = buildOruwaCafeFixturePlan(ORUWA_CAFE_FIXTURE, context);
  const planB = buildOruwaCafeFixturePlan(ORUWA_CAFE_FIXTURE, context);
  assert.deepEqual(planA, planB);
});
