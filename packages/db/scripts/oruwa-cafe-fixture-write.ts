/**
 * `oruwa-cafe` QA fixture WRITE-side executor (Cafe Manager UI/UX Parity
 * mission, WP-10).
 *
 * Resolves live tenant state, builds the plan via the pure
 * `buildOruwaCafeFixturePlan` (see `oruwa-cafe-fixture.ts`), prints it, and
 * only actually writes when `--confirm-apply` is passed -- the same
 * dry-run-by-default safety convention `mame-to-cha-rehearsal.ts` already
 * established in this package. Re-running without `--confirm-apply` is
 * always safe (read-only).
 *
 * CONNECTION -- this targets whatever `SUPABASE_URL` / `SUPABASE_SECRET_KEY` /
 * `SUPABASE_PUBLISHABLE_KEY` currently resolve to (local or the linked Cloud
 * dev project), same
 * operator-controlled-target convention as `scripts/seed.ts`. Unlike
 * `onboard-db.ts`/`mame-to-cha-*`, this tool is NOT gated to
 * `assertLocalDatabaseUrl` -- it deliberately targets Cloud (that is the
 * whole point: seeding QA-visible data for the Vercel Preview deployment,
 * which reads the linked Cloud project, not a local database). Treat
 * running this with `--confirm-apply` as a real Cloud data write.
 *
 * TENANT/IDENTITY RESOLUTION -- `core`/`workforce`/`inventory` are
 * deliberately NOT exposed to PostgREST (`supabase/config.toml`'s own
 * comment: "mirrors the intended Cloud dev Data API posture"), so this tool
 * cannot resolve the `oruwa-cafe` tenant/location/manager-user id by
 * querying `core.tenants`/`core.locations`/`core.tenant_memberships`
 * directly -- there is no `api.*` view for that (every existing `api.*`
 * view scopes reads to the CALLING user's own tenant via RLS, which a
 * service-role script with no acting user has no way to satisfy). The three
 * ids below are hardcoded from the already-documented, already-verified
 * values in `docs/ai/ORUWA_CAFE_V2_1_REFERENCE_TENANT_REPORT_2026-08-14.md`
 * (§8-9, §15) -- re-verify against that file (or Supabase Studio) if this
 * tool ever reports "tenant not found"-shaped errors.
 *
 * AUTH MODE SPLIT (two different callers, for two different reasons):
 *   - `shift_requests` / `shift_assignments` / `shift_exchanges` /
 *     `inventory_items` all insert through their `api.*` view using the
 *     SERVICE-ROLE client, which bypasses RLS entirely -- necessary because
 *     `shift_requests`/`shift_exchanges`' own insert RLS is scoped to
 *     "the employee inserting their own row" (`is_own_employee`), and this
 *     tool has no staff login to act as; only a service-role bypass can
 *     seed these on a staff member's behalf. Migrations 0075-0077 grant
 *     service_role the schema/table/EXECUTE access this needs (it had none
 *     before -- this is the first tool in the codebase to ever call
 *     `.schema('api')` as service_role).
 *   - Reading the active employee roster (`api.workforce_staff_directory`)
 *     and recording a stock count (`api.record_inventory_stock_count` RPC)
 *     both need a real AUTHENTICATED caller instead, for two different
 *     reasons: `workforce_staff_directory`'s own view definition (not just
 *     RLS) filters rows by `core.has_permission(...)`, which evaluates
 *     against the CALLING user's own role assignment -- service_role has no
 *     acting user, so that predicate is always false for it regardless of
 *     any schema/table grant. The stock-count RPC stamps
 *     `counted_by = core.current_user_id()`, which resolves from the JWT and
 *     is likewise meaningless for a service-role call. Both sign in as the
 *     manager test account (`manager@oruwa-cafe.test`, the same identity
 *     already used for every live-QA pass in this mission) via a real
 *     password sign-in -- exactly how the app itself would resolve these,
 *     not a bypass.
 */
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { createServiceClient, createUserClient } from '../src/client.js';
import { serverEnv } from '@line-os/config/env';
import {
  ORUWA_CAFE_FIXTURE,
  buildOruwaCafeFixturePlan,
  FIXTURE_ITEM_MARKERS,
  type OruwaCafeFixtureContext,
  type OruwaCafeFixturePlan,
} from './oruwa-cafe-fixture.js';
import { localDateTimeToUtcIso } from './mame-to-cha-dates.js';

/** From `docs/ai/ORUWA_CAFE_V2_1_REFERENCE_TENANT_REPORT_2026-08-14.md` §8-9/§15 -- re-verify there (or in Supabase Studio) if this tool ever fails to find the tenant. */
const ORUWA_CAFE_TENANT_ID = '72b81b2f-9ba5-4a4a-a296-02e32d4682b8';
const ORUWA_CAFE_LOCATION_ID = '4bad308e-f8d3-4c20-a158-b6eb3bafa71b';
const ORUWA_CAFE_TIME_ZONE = 'Asia/Tokyo';
/** The manager test identity already used for every live-QA pass in this mission -- signed in only to satisfy the stock-count RPC's `counted_by = core.current_user_id()` requirement below, see module doc comment. */
const ORUWA_CAFE_MANAGER_EMAIL = 'manager@oruwa-cafe.test';

interface StockCountToRecord {
  itemId: string;
  actualQuantity: number;
}

let cachedManagerClient: ReturnType<typeof createUserClient> | null = null;

/** Signs in as the manager test account once per process run and returns an authenticated client -- see this file's module doc comment for why some reads/writes need a real acting user instead of the service-role client. */
async function getManagerClient(): Promise<ReturnType<typeof createUserClient>> {
  if (cachedManagerClient) return cachedManagerClient;
  const env = serverEnv();
  const managerPassword = process.env.ORUWA_CAFE_MANAGER_PASSWORD;
  if (!managerPassword) {
    throw new Error(
      'ORUWA_CAFE_MANAGER_PASSWORD env var is required (used to read the active employee roster and, on --confirm-apply, to record the fixture inventory shortage item\'s stock count -- see this file\'s module doc comment for why a service-role call cannot do either).',
    );
  }
  const signInClient = createClient(env.SUPABASE_URL, env.supabaseUserKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: signInData, error: signInError } = await signInClient.auth.signInWithPassword({
    email: ORUWA_CAFE_MANAGER_EMAIL,
    password: managerPassword,
  });
  if (signInError || !signInData.session) {
    throw new Error(`Failed to sign in as the manager test account: ${signInError?.message ?? 'no session returned'}`);
  }
  cachedManagerClient = createUserClient(signInData.session.access_token);
  return cachedManagerClient;
}

async function resolveContext(): Promise<OruwaCafeFixtureContext> {
  const supabase = createServiceClient();
  const managerClient = await getManagerClient();

  const { data: employees, error: employeesError } = await managerClient
    .schema('api')
    .from('workforce_staff_directory')
    .select('staff_id')
    .eq('tenant_id', ORUWA_CAFE_TENANT_ID)
    .eq('location_id', ORUWA_CAFE_LOCATION_ID)
    .eq('is_active', true)
    .order('staff_id');
  if (employeesError) throw new Error(`Failed to read oruwa-cafe's active employees: ${employeesError.message}`);
  const activeEmployeeIds = ((employees ?? []) as { staff_id: string }[]).map((e) => e.staff_id);

  const { data: items, error: itemsError } = await supabase
    .schema('api')
    .from('inventory_items')
    .select('item_id, name')
    .eq('tenant_id', ORUWA_CAFE_TENANT_ID)
    .eq('location_id', ORUWA_CAFE_LOCATION_ID);
  if (itemsError) throw new Error(`Failed to read oruwa-cafe's inventory items: ${itemsError.message}`);
  const itemRows = (items ?? []) as { item_id: string; name: string }[];
  const existingInventoryItemNames = itemRows.map((i) => i.name);

  const { data: preferenceRows, error: preferenceError } = await supabase
    .schema('api')
    .from('workforce_shift_requests')
    .select('details')
    .eq('tenant_id', ORUWA_CAFE_TENANT_ID)
    .eq('kind', 'preference');
  if (preferenceError) throw new Error(`Failed to check for an already-seeded unavailable-conflict fixture: ${preferenceError.message}`);
  const { data: correctionRows, error: correctionError } = await supabase
    .schema('api')
    .from('workforce_shift_requests')
    .select('details')
    .eq('tenant_id', ORUWA_CAFE_TENANT_ID)
    .eq('kind', 'correction');
  if (correctionError) throw new Error(`Failed to check for already-seeded correction fixtures: ${correctionError.message}`);
  const { data: exchangeRows, error: exchangeError } = await supabase
    .schema('api')
    .from('workforce_shift_exchanges')
    .select('reason')
    .eq('tenant_id', ORUWA_CAFE_TENANT_ID);
  if (exchangeError) throw new Error(`Failed to check for an already-seeded shift-exchange fixture: ${exchangeError.message}`);

  const hasMarker = (rows: { details?: unknown }[] | { reason?: unknown }[], marker: string, field: 'details' | 'reason'): boolean =>
    rows.some((row) => {
      const value = (row as Record<string, unknown>)[field];
      if (field === 'reason') return typeof value === 'string' && value.includes(marker);
      return typeof value === 'object' && value !== null && (value as Record<string, unknown>).qaFixtureMarker === marker;
    });

  const context: OruwaCafeFixtureContext = {
    tenantId: ORUWA_CAFE_TENANT_ID,
    locationId: ORUWA_CAFE_LOCATION_ID,
    timeZone: ORUWA_CAFE_TIME_ZONE,
    todayIso: new Date().toISOString().slice(0, 10),
    activeEmployeeIds,
    existingInventoryItemNames,
    alreadySeeded: {
      unavailableConflict: hasMarker(preferenceRows ?? [], FIXTURE_ITEM_MARKERS.unavailableConflict, 'details'),
      pendingCorrectionPast: hasMarker(correctionRows ?? [], FIXTURE_ITEM_MARKERS.pendingCorrectionPast, 'details'),
      pendingCorrectionFuture: hasMarker(correctionRows ?? [], FIXTURE_ITEM_MARKERS.pendingCorrectionFuture, 'details'),
      pendingShiftExchange: hasMarker(exchangeRows ?? [], FIXTURE_ITEM_MARKERS.pendingShiftExchange, 'reason'),
    },
  };

  return context;
}

function printPlan(plan: OruwaCafeFixturePlan): void {
  console.log('oruwa-cafe fixture plan:');
  console.log(`  shift assignments to insert: ${plan.shiftAssignmentInserts.length}`);
  console.log(`  shift requests to insert:    ${plan.shiftRequestInserts.length}`);
  console.log(`  shift exchanges to insert:   ${plan.shiftExchangeInserts.length}`);
  console.log(`  inventory items to insert:   ${plan.inventoryItemInserts.length}`);
  if (plan.skipped.length > 0) {
    console.log('  skipped:');
    for (const reason of plan.skipped) console.log(`    - ${reason}`);
  }
}

async function applyPlan(plan: OruwaCafeFixturePlan): Promise<void> {
  const supabase = createServiceClient();

  // Assignments first -- the shift-exchange insert below needs a real assignment_id to reference.
  const assignmentIdByMarker = new Map<string, string>();
  for (const assignment of plan.shiftAssignmentInserts) {
    const startsAt = localDateTimeToUtcIso(assignment.workDateIso, assignment.startsAtLocal, ORUWA_CAFE_TIME_ZONE);
    const endsAt = localDateTimeToUtcIso(assignment.workDateIso, assignment.endsAtLocal, ORUWA_CAFE_TIME_ZONE);
    const { data, error } = await supabase
      .schema('api')
      .from('workforce_shift_assignments')
      .insert({
        tenant_id: ORUWA_CAFE_TENANT_ID,
        location_id: ORUWA_CAFE_LOCATION_ID,
        employee_id: assignment.employeeId,
        shift_type_id: null,
        starts_at: startsAt,
        ends_at: endsAt,
        break_minutes: 0,
        notes: assignment.notes,
        published: assignment.published,
      })
      .select('assignment_id')
      .single();
    if (error) throw new Error(`Failed to insert fixture shift assignment (${assignment.notes}): ${error.message}`);
    assignmentIdByMarker.set(assignment.notes, (data as { assignment_id: string }).assignment_id);
    console.log(`  inserted shift assignment ${(data as { assignment_id: string }).assignment_id} (${assignment.notes})`);
  }

  for (const request of plan.shiftRequestInserts) {
    const { error } = await supabase
      .schema('api')
      .from('workforce_shift_requests')
      .insert({
        tenant_id: ORUWA_CAFE_TENANT_ID,
        location_id: ORUWA_CAFE_LOCATION_ID,
        employee_id: request.employeeId,
        kind: request.requestKind,
        work_date: request.workDateIso,
        shift_type_id: null,
        is_unavailable: request.isUnavailable,
        status: request.status,
        details: request.details,
      });
    if (error) throw new Error(`Failed to insert fixture shift request (${request.requestKind}, ${request.workDateIso}): ${error.message}`);
    console.log(`  inserted shift request: ${request.requestKind} ${request.employeeId} ${request.workDateIso}`);
  }

  for (const exchange of plan.shiftExchangeInserts) {
    const shiftId = assignmentIdByMarker.get(exchange.linkedAssignmentMarker);
    if (!shiftId) throw new Error(`Fixture bug: no assignment id resolved for shift-exchange marker "${exchange.linkedAssignmentMarker}".`);
    const { error } = await supabase
      .schema('api')
      .from('workforce_shift_exchanges')
      .insert({
        tenant_id: ORUWA_CAFE_TENANT_ID,
        location_id: ORUWA_CAFE_LOCATION_ID,
        shift_id: shiftId,
        requester_employee_id: exchange.requesterEmployeeId,
        reason: exchange.reason,
        request_kind: exchange.requestKind,
      });
    if (error) throw new Error(`Failed to insert fixture shift exchange: ${error.message}`);
    console.log(`  inserted shift exchange for assignment ${shiftId}`);
  }

  const stockCountsToRecord: StockCountToRecord[] = [];
  for (const item of plan.inventoryItemInserts) {
    const { data, error } = await supabase
      .schema('api')
      .from('inventory_items')
      .insert({
        tenant_id: ORUWA_CAFE_TENANT_ID,
        location_id: ORUWA_CAFE_LOCATION_ID,
        name: item.name,
        unit: item.unit,
        required_quantity: item.requiredQuantity,
        reorder_point: item.reorderPoint,
        sort_order: 0,
      })
      .select('item_id')
      .single();
    if (error) throw new Error(`Failed to insert fixture inventory item "${item.name}": ${error.message}`);
    const itemId = (data as { item_id: string }).item_id;
    console.log(`  inserted inventory item ${itemId} (${item.name})`);
    if (item.initialActualQuantity !== undefined) {
      stockCountsToRecord.push({ itemId, actualQuantity: item.initialActualQuantity });
    }
  }

  if (stockCountsToRecord.length > 0) {
    const managerClient = await getManagerClient();
    for (const count of stockCountsToRecord) {
      const { error } = await managerClient.schema('api').rpc('record_inventory_stock_count', {
        p_tenant_id: ORUWA_CAFE_TENANT_ID,
        p_location_id: ORUWA_CAFE_LOCATION_ID,
        p_item_id: count.itemId,
        p_actual_quantity: count.actualQuantity,
      });
      if (error) throw new Error(`Failed to record fixture stock count for item ${count.itemId}: ${error.message}`);
      console.log(`  recorded stock count ${count.actualQuantity} for item ${count.itemId}`);
    }
  }
}

async function main(): Promise<void> {
  const confirmApply = process.argv.includes('--confirm-apply');

  const context = await resolveContext();
  const plan = buildOruwaCafeFixturePlan(ORUWA_CAFE_FIXTURE, context);
  printPlan(plan);

  if (!confirmApply) {
    console.log('\nDry run only -- nothing was written. Re-run with --confirm-apply to write for real.');
    return;
  }

  const totalWrites =
    plan.shiftAssignmentInserts.length + plan.shiftRequestInserts.length + plan.shiftExchangeInserts.length + plan.inventoryItemInserts.length;
  if (totalWrites === 0) {
    console.log('\nNothing to write (every fixture item already seeded).');
    return;
  }

  console.log('\nApplying plan...');
  await applyPlan(plan);
  console.log('\nDone.');
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((err) => {
    console.error('oruwa-cafe-fixture-write failed:', err instanceof Error ? err.message : err);
    // Set exitCode (not process.exit()) so pending libuv handles (open network
    // sockets from the Supabase client) drain naturally instead of forcing an
    // abrupt shutdown -- an immediate process.exit() here has been observed to
    // crash with a libuv assertion on Windows (UV_HANDLE_CLOSING) when I/O is
    // still in flight.
    process.exitCode = 1;
  });
}
