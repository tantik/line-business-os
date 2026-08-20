/**
 * `oruwa-cafe` QA fixture manifest + pure plan builder (Cafe Manager UI/UX
 * Parity mission, WP-10).
 *
 * SCOPE — unlike `mame-to-cha-fixture.ts`, this does NOT provision a tenant:
 * `oruwa-cafe` already exists as a real, live tenant with real employees,
 * shift types, and history from earlier missions (do not "templatize" its
 * data -- see project memory `project_v2_2_and_provisioning_plan`). This
 * module only describes ADDITIONAL QA-visibility rows to seed into that
 * existing tenant, so the Manager UI's newer features (WP-3's
 * resend/recover-access, WP-8's understaffed/pending-correction markers,
 * WP-11's correction/exchange popups) have something real to show during
 * live Preview QA instead of requiring a reviewer to manually create each
 * row through the UI first.
 *
 * PURE: no Supabase client, no database, no `Date.now()`/`Math.random()`
 * dependence on "now" (the caller supplies `todayIso`/`now`, same
 * discipline as `mame-to-cha-fixture.ts`/`mame-to-cha-dates.ts`). All dates
 * are relative day OFFSETS from "today", so re-running the write script on a
 * different day still targets stable, predictable dates. This file only
 * decides WHAT to write, given the live tenant state the executor
 * (`oruwa-cafe-fixture-write.ts`) resolves and passes in as
 * {@link OruwaCafeFixtureContext} -- it performs no I/O itself, which is
 * what makes it fully unit-testable without a database.
 */

export const FIXTURE_MANIFEST_VERSION = 1 as const;

/** The exact, deterministic tenant slug this fixture targets -- never a variant or a guess. */
export const ORUWA_CAFE_TENANT_SLUG = 'oruwa-cafe' as const;

/**
 * Tags every row this tool creates (via each write's own free-text field --
 * `shift_requests.details`, `shift_assignments.notes`,
 * `shift_exchanges.reason`, no schema change) so a future cleanup pass, or a
 * human reading the data, can tell fixture rows apart from real usage
 * without guessing, and so the executor can detect "already seeded" on a
 * rerun by querying for the marker rather than re-deriving dates.
 */
export const FIXTURE_OWNERSHIP_MARKER = 'oruwa-cafe-fixture-v1';

/** One distinct marker per date/employee-scoped fixture item, so a rerun can tell them apart precisely instead of treating the whole fixture as one all-or-nothing unit. */
export const FIXTURE_ITEM_MARKERS = {
  unavailableConflict: `${FIXTURE_OWNERSHIP_MARKER}:unavailable-conflict`,
  pendingCorrectionPast: `${FIXTURE_OWNERSHIP_MARKER}:correction-past`,
  pendingCorrectionFuture: `${FIXTURE_OWNERSHIP_MARKER}:correction-future`,
  pendingShiftExchange: `${FIXTURE_OWNERSHIP_MARKER}:shift-exchange`,
} as const;

export interface OruwaCafeFixtureManifest {
  manifestVersion: typeof FIXTURE_MANIFEST_VERSION;
  /** WP-8's unavailable-conflict cell: an employee with both a submitted Unavailable preference and an assigned shift on the same date. */
  unavailableConflict: {
    /** Index into the context's `activeEmployeeIds` (deterministically sorted) -- never a hardcoded id. */
    employeeIndex: number;
    workDateOffsetDays: number;
    startsAtLocal: string;
    endsAtLocal: string;
  };
  /** WP-8's per-cell "!" marker: a pending correction request on a PAST day. */
  pendingCorrectionPast: {
    employeeIndex: number;
    workDateOffsetDays: number;
    clockInLocal: string;
    clockOutLocal: string;
    actualBreakMinutes: number;
  };
  /** A pending correction on a future day -- exercises the general corrections list without tripping WP-8's past-day-only cell marker. */
  pendingCorrectionFuture: {
    employeeIndex: number;
    workDateOffsetDays: number;
    clockInLocal: string;
    clockOutLocal: string;
    actualBreakMinutes: number;
  };
  /** A pending shift-exchange request, needs a real published future shift of its own (created alongside it). */
  pendingShiftExchange: {
    employeeIndex: number;
    workDateOffsetDays: number;
    startsAtLocal: string;
    endsAtLocal: string;
    reason: string;
  };
  inventoryShortageItem: {
    name: string;
    unit: 'kg' | 'g' | 'L' | 'mL' | 'pcs';
    requiredQuantity: number;
    reorderPoint: number;
    /** Recorded via a `stock_counts` row at or below `reorderPoint`. */
    actualQuantity: number;
  };
  inventoryUncountedItem: {
    name: string;
    unit: 'kg' | 'g' | 'L' | 'mL' | 'pcs';
    requiredQuantity: number;
    reorderPoint: number;
  };
}

export const ORUWA_CAFE_FIXTURE: OruwaCafeFixtureManifest = {
  manifestVersion: FIXTURE_MANIFEST_VERSION,
  unavailableConflict: {
    employeeIndex: 0,
    workDateOffsetDays: 3,
    startsAtLocal: '10:00',
    endsAtLocal: '14:00',
  },
  pendingCorrectionPast: {
    employeeIndex: 1,
    workDateOffsetDays: -2,
    clockInLocal: '09:00',
    clockOutLocal: '13:00',
    actualBreakMinutes: 0,
  },
  pendingCorrectionFuture: {
    employeeIndex: 1,
    workDateOffsetDays: 5,
    clockInLocal: '09:00',
    clockOutLocal: '17:00',
    actualBreakMinutes: 60,
  },
  pendingShiftExchange: {
    employeeIndex: 2,
    workDateOffsetDays: 4,
    startsAtLocal: '13:00',
    endsAtLocal: '18:00',
    reason: `QA fixture (${FIXTURE_ITEM_MARKERS.pendingShiftExchange}): sample shift exchange request for Manager popup review.`,
  },
  inventoryShortageItem: {
    name: 'QAフィクスチャー：抹茶パウダー',
    unit: 'g',
    requiredQuantity: 500,
    reorderPoint: 100,
    actualQuantity: 40,
  },
  inventoryUncountedItem: {
    name: 'QAフィクスチャー：紙コップ（Mサイズ）',
    unit: 'pcs',
    requiredQuantity: 200,
    reorderPoint: 50,
  },
};

/** Live tenant state the executor resolves via the service client and hands to the pure plan builder -- this is the only I/O boundary. */
export interface OruwaCafeFixtureContext {
  tenantId: string;
  locationId: string;
  timeZone: string;
  /** `YYYY-MM-DD`, caller-supplied so the plan is deterministic/testable, never `new Date()` read internally. */
  todayIso: string;
  /** Active employee ids for this tenant/location, in a stable deterministic order (e.g. sorted by id) -- referenced by `employeeIndex`, never a hardcoded id or a name lookup (employee names are PII-encrypted; this fixture never decrypts one). */
  activeEmployeeIds: readonly string[];
  /** Existing inventory item names in this tenant/location, so a rerun does not create duplicates. */
  existingInventoryItemNames: readonly string[];
  /**
   * Whether an unavailable-conflict / past-pending-correction / future-pending-correction /
   * pending-shift-exchange row already exists for this fixture's target employee/date (checked
   * by the executor via a light existence query keyed on the ownership marker) -- lets a rerun
   * skip instead of duplicating. `true` means "already present, skip".
   */
  alreadySeeded: {
    unavailableConflict: boolean;
    pendingCorrectionPast: boolean;
    pendingCorrectionFuture: boolean;
    pendingShiftExchange: boolean;
  };
}

export interface PlannedShiftAssignmentInsert {
  kind: 'shiftAssignment';
  employeeId: string;
  workDateIso: string;
  startsAtLocal: string;
  endsAtLocal: string;
  published: boolean;
  /** Set on the unavailable-conflict/exchange fixture assignments so a future cleanup pass can find them; written to the row's free-text `notes` column. */
  notes: string;
}

export interface PlannedShiftRequestInsert {
  kind: 'shiftRequest';
  employeeId: string;
  workDateIso: string;
  requestKind: 'preference' | 'correction';
  isUnavailable: boolean;
  status: 'pending';
  details: Record<string, unknown>;
}

export interface PlannedShiftExchangeInsert {
  kind: 'shiftExchange';
  /** Resolved by the executor once its own `PlannedShiftAssignmentInsert` above has actually been written and returned an id -- the plan carries the *intent* to link them, not the id itself (pure functions cannot know a not-yet-generated id). */
  linkedAssignmentMarker: string;
  requesterEmployeeId: string;
  reason: string;
  requestKind: 'exchange';
  status: 'open';
}

export interface PlannedInventoryItemInsert {
  kind: 'inventoryItem';
  name: string;
  unit: 'kg' | 'g' | 'L' | 'mL' | 'pcs';
  requiredQuantity: number;
  reorderPoint: number;
  /** `undefined` means "leave uncounted" -- no `stock_counts` row. */
  initialActualQuantity: number | undefined;
}

export interface OruwaCafeFixturePlan {
  shiftAssignmentInserts: PlannedShiftAssignmentInsert[];
  shiftRequestInserts: PlannedShiftRequestInsert[];
  shiftExchangeInserts: PlannedShiftExchangeInsert[];
  inventoryItemInserts: PlannedInventoryItemInsert[];
  /** Human-readable reasons for anything the manifest asked for but this plan omitted (already seeded, no eligible employee, etc.). */
  skipped: string[];
}

function offsetIso(todayIso: string, offsetDays: number): string {
  const [year, month, day] = todayIso.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    throw new Error(`Invalid todayIso: "${todayIso}".`);
  }
  const shifted = new Date(Date.UTC(year, month - 1, day + offsetDays));
  return shifted.toISOString().slice(0, 10);
}

/**
 * Pure: given the manifest and the executor-resolved live context, decide
 * exactly what to write. No I/O, no randomness, no implicit "now" -- every
 * date is derived from `context.todayIso` alone, so the same
 * manifest+context pair always produces the same plan.
 */
export function buildOruwaCafeFixturePlan(
  manifest: OruwaCafeFixtureManifest,
  context: OruwaCafeFixtureContext,
): OruwaCafeFixturePlan {
  const plan: OruwaCafeFixturePlan = {
    shiftAssignmentInserts: [],
    shiftRequestInserts: [],
    shiftExchangeInserts: [],
    inventoryItemInserts: [],
    skipped: [],
  };

  function employeeIdFor(index: number, label: string): string | null {
    const id = context.activeEmployeeIds[index];
    if (!id) {
      plan.skipped.push(`${label}: no active employee at index ${index} (tenant has ${context.activeEmployeeIds.length}).`);
      return null;
    }
    return id;
  }

  // -- Unavailable-conflict cell --------------------------------------------
  if (context.alreadySeeded.unavailableConflict) {
    plan.skipped.push('unavailableConflict: already seeded (rerun).');
  } else {
    const employeeId = employeeIdFor(manifest.unavailableConflict.employeeIndex, 'unavailableConflict');
    if (employeeId) {
      const workDateIso = offsetIso(context.todayIso, manifest.unavailableConflict.workDateOffsetDays);
      plan.shiftRequestInserts.push({
        kind: 'shiftRequest',
        employeeId,
        workDateIso,
        requestKind: 'preference',
        isUnavailable: true,
        status: 'pending',
        details: { qaFixtureMarker: FIXTURE_ITEM_MARKERS.unavailableConflict },
      });
      plan.shiftAssignmentInserts.push({
        kind: 'shiftAssignment',
        employeeId,
        workDateIso,
        startsAtLocal: manifest.unavailableConflict.startsAtLocal,
        endsAtLocal: manifest.unavailableConflict.endsAtLocal,
        published: true,
        notes: FIXTURE_ITEM_MARKERS.unavailableConflict,
      });
    }
  }

  // -- Pending correction, past day (WP-8 per-cell "!" marker) -------------
  if (context.alreadySeeded.pendingCorrectionPast) {
    plan.skipped.push('pendingCorrectionPast: already seeded (rerun).');
  } else {
    const employeeId = employeeIdFor(manifest.pendingCorrectionPast.employeeIndex, 'pendingCorrectionPast');
    if (employeeId) {
      const { workDateOffsetDays, clockInLocal, clockOutLocal, actualBreakMinutes } = manifest.pendingCorrectionPast;
      if (workDateOffsetDays >= 0) {
        plan.skipped.push('pendingCorrectionPast: manifest workDateOffsetDays must be negative (a past day) -- refusing to seed a non-past date for this fixture.');
      } else {
        plan.shiftRequestInserts.push({
          kind: 'shiftRequest',
          employeeId,
          workDateIso: offsetIso(context.todayIso, workDateOffsetDays),
          requestKind: 'correction',
          isUnavailable: false,
          status: 'pending',
          details: { clockInLocal, clockOutLocal, actualBreakMinutes, qaFixtureMarker: FIXTURE_ITEM_MARKERS.pendingCorrectionPast },
        });
      }
    }
  }

  // -- Pending correction, future day ---------------------------------------
  if (context.alreadySeeded.pendingCorrectionFuture) {
    plan.skipped.push('pendingCorrectionFuture: already seeded (rerun).');
  } else {
    const employeeId = employeeIdFor(manifest.pendingCorrectionFuture.employeeIndex, 'pendingCorrectionFuture');
    if (employeeId) {
      const { workDateOffsetDays, clockInLocal, clockOutLocal, actualBreakMinutes } = manifest.pendingCorrectionFuture;
      plan.shiftRequestInserts.push({
        kind: 'shiftRequest',
        employeeId,
        workDateIso: offsetIso(context.todayIso, workDateOffsetDays),
        requestKind: 'correction',
        isUnavailable: false,
        status: 'pending',
        details: { clockInLocal, clockOutLocal, actualBreakMinutes, qaFixtureMarker: FIXTURE_ITEM_MARKERS.pendingCorrectionFuture },
      });
    }
  }

  // -- Pending shift exchange (needs its own published future shift) -------
  if (context.alreadySeeded.pendingShiftExchange) {
    plan.skipped.push('pendingShiftExchange: already seeded (rerun).');
  } else {
    const employeeId = employeeIdFor(manifest.pendingShiftExchange.employeeIndex, 'pendingShiftExchange');
    if (employeeId) {
      const marker = FIXTURE_ITEM_MARKERS.pendingShiftExchange;
      plan.shiftAssignmentInserts.push({
        kind: 'shiftAssignment',
        employeeId,
        workDateIso: offsetIso(context.todayIso, manifest.pendingShiftExchange.workDateOffsetDays),
        startsAtLocal: manifest.pendingShiftExchange.startsAtLocal,
        endsAtLocal: manifest.pendingShiftExchange.endsAtLocal,
        published: true,
        notes: marker,
      });
      plan.shiftExchangeInserts.push({
        kind: 'shiftExchange',
        linkedAssignmentMarker: marker,
        requesterEmployeeId: employeeId,
        reason: manifest.pendingShiftExchange.reason,
        requestKind: 'exchange',
        status: 'open',
      });
    }
  }

  // -- Inventory items -------------------------------------------------------
  if (context.existingInventoryItemNames.includes(manifest.inventoryShortageItem.name)) {
    plan.skipped.push(`inventoryShortageItem: an item named "${manifest.inventoryShortageItem.name}" already exists (rerun).`);
  } else {
    plan.inventoryItemInserts.push({
      kind: 'inventoryItem',
      name: manifest.inventoryShortageItem.name,
      unit: manifest.inventoryShortageItem.unit,
      requiredQuantity: manifest.inventoryShortageItem.requiredQuantity,
      reorderPoint: manifest.inventoryShortageItem.reorderPoint,
      initialActualQuantity: manifest.inventoryShortageItem.actualQuantity,
    });
  }
  if (context.existingInventoryItemNames.includes(manifest.inventoryUncountedItem.name)) {
    plan.skipped.push(`inventoryUncountedItem: an item named "${manifest.inventoryUncountedItem.name}" already exists (rerun).`);
  } else {
    plan.inventoryItemInserts.push({
      kind: 'inventoryItem',
      name: manifest.inventoryUncountedItem.name,
      unit: manifest.inventoryUncountedItem.unit,
      requiredQuantity: manifest.inventoryUncountedItem.requiredQuantity,
      reorderPoint: manifest.inventoryUncountedItem.reorderPoint,
      initialActualQuantity: undefined,
    });
  }

  return plan;
}
