import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { encryptPII, bufferToBytea } from '@line-os/db/crypto';
import { loadManagerDashboard, MANAGER_DASHBOARD_PARTS, type ManagerDashboardPart } from './dashboard';
import { recordingClient } from '../workforce/test-helpers';
import { listWorkforceStaffForManager } from '../workforce/employees';
import { listEmployeeLineLinks } from '../workforce/employee-line-links';
import { listWorkforceShiftTypes } from '../workforce/shift-types';
import { listShiftRequestsForManager } from '../workforce/shift-requests';
import { listShiftAssignments } from '../workforce/shift-assignments';
import { listAttendanceForManager } from '../workforce/attendance';
import { listWorkforceEmployeeInvitations } from '../workforce/invitations';
import { listShiftExchanges } from '../workforce/shift-exchanges';
import { listStaffMessagesForManager } from '../workforce/staff-messages';
import { listInventoryItemStatus } from '../inventory/items';
import { listPurchasesNeeded } from '../purchases/items';
import { listPurchaseHistory } from '../purchases/history';
import { listPurchasesAwaitingDelivery } from '../purchases/awaiting-delivery';
import { listWorkforceRecipeCategories } from '../workforce/recipe-categories';
import { listWorkforceRecipes } from '../workforce/recipes';
import { getWorkforceScheduleSettings, listRecentAutoScheduleRuns } from '../workforce/schedule-settings';
import { listContentTranslationsForField } from '../content/translations';
import { getMyWorkforceStaffProfile } from '../workforce/staff-profile';
import { listOperationsTemplateItems, listOperationsTemplates } from '../operations/templates';
import { listOperationsSchedules } from '../operations/schedules';
import { listExpectedTasks } from '../operations/tasks';
import { listOpenOperationsExceptions } from '../operations/exceptions';
import { listAllIssues, listOpenIssues } from '../issues/issues';

const T = 'tenant-1';
const L = 'loc-1';
const ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
process.env.PII_ENCRYPTION_KEY = ENCRYPTION_KEY;
process.env.PII_HASH_PEPPER = 'p'.repeat(16);

function rpcClient(result: { data?: unknown; error?: unknown } | (() => never), calls: unknown[] = []): SupabaseClient {
  return {
    schema: (schema: string) => ({
      rpc: async (fn: string, args: unknown) => {
        calls.push({ schema, fn, args });
        if (typeof result === 'function') return result();
        return { data: result.data ?? null, error: result.error ?? null };
      },
    }),
  } as unknown as SupabaseClient;
}

const enc = (text: string) => bufferToBytea(encryptPII(text, ENCRYPTION_KEY));
const ts = (day: number) => `2026-01-${String(day).padStart(2, '0')}T00:00:00+00:00`;

// ---- realistic raw rows per part (two per list, deliberately out of display order) ----
const staffRows = [
  { staff_id: 's2', tenant_id: T, location_id: L, name_encrypted: enc('Yamada'), name_hash: 'h2', family_name_encrypted: null, given_name_encrypted: null, email_encrypted: enc('y@example.test'), email_hash: 'eh2', notes_encrypted: null, position_label: 'Barista', employment_type: 'part_time', is_active: true, created_at: ts(1), updated_at: ts(2), hourly_wage_yen: 1100, has_account_access: true, is_manager: false, is_admin: false },
  { staff_id: 's1', tenant_id: T, location_id: L, name_encrypted: enc('Aoki'), name_hash: 'h1', family_name_encrypted: enc('Aoki'), given_name_encrypted: enc('Ken'), email_encrypted: null, email_hash: null, notes_encrypted: enc('note'), position_label: null, employment_type: null, is_active: false, created_at: ts(1), updated_at: ts(1), hourly_wage_yen: null, has_account_access: false, is_manager: true, is_admin: false },
];
const assignmentRows = [
  { assignment_id: 'a2', tenant_id: T, location_id: L, employee_id: 's1', shift_type_id: 'st1', starts_at: ts(6), ends_at: ts(6), break_minutes: 60, role: null, notes: null, published: true, created_at: ts(1), updated_at: ts(1) },
  { assignment_id: 'a1', tenant_id: T, location_id: L, employee_id: null, shift_type_id: null, starts_at: ts(5), ends_at: ts(5), break_minutes: 0, role: 'hall', notes: 'n', published: false, created_at: ts(1), updated_at: ts(1) },
];
const requestRows = (kind: string) => [
  { request_id: 'r2', tenant_id: T, location_id: L, employee_id: 's2', shift_id: null, shift_type_id: 'st1', work_date: '2026-01-08', kind, is_unavailable: false, status: 'pending', details: { note: 'x' }, attendance_id: null, created_at: ts(1), updated_at: ts(1) },
  { request_id: 'r1', tenant_id: T, location_id: L, employee_id: 's1', shift_id: null, shift_type_id: null, work_date: '2026-01-08', kind, is_unavailable: true, status: 'approved', details: null, attendance_id: 'att1', created_at: ts(1), updated_at: ts(2) },
];
const ROWS: Record<Exclude<ManagerDashboardPart, 'staff'>, Record<string, unknown>[]> = {
  lineLinks: [
    { link_id: 'k2', tenant_id: T, employee_id: 's2', is_active: true, linked_at: ts(1), created_at: ts(1), updated_at: ts(1) },
    { link_id: 'k1', tenant_id: T, employee_id: 's1', is_active: false, linked_at: ts(1), created_at: ts(1), updated_at: ts(1) },
  ],
  shiftTypes: [
    { shift_type_id: 'st2', tenant_id: T, location_id: L, code: 'LATE', label_ja: '遅番', label_en: null, starts_at_local: '13:00:00', ends_at_local: '21:00:00', break_minutes: 60, is_custom: false, sort_order: 2, is_active: true },
    { shift_type_id: 'st1', tenant_id: T, location_id: L, code: 'DAY', label_ja: '日勤', label_en: 'Day', starts_at_local: '09:00:00', ends_at_local: '17:00:00', break_minutes: 60, is_custom: false, sort_order: 1, is_active: true },
  ],
  preferenceRequests: requestRows('preference'),
  assignments: assignmentRows,
  correctionRequests: requestRows('correction'),
  attendance: [
    { attendance_id: 'att2', tenant_id: T, location_id: L, employee_id: 's2', shift_id: null, work_date: '2026-01-07', clock_in: ts(7), clock_out: null, actual_break_minutes: 0, status: 'present', transportation_cost: 300, daily_message: null, created_at: ts(7), updated_at: ts(7) },
    { attendance_id: 'att1', tenant_id: T, location_id: L, employee_id: 's1', shift_id: 'a2', work_date: '2026-01-06', clock_in: null, clock_out: null, actual_break_minutes: 30, status: 'absent', transportation_cost: null, daily_message: 'hi', created_at: ts(6), updated_at: ts(6) },
  ],
  invitations: [
    { invitation_id: 'i1', tenant_id: T, employee_id: 's1', status: 'pending', created_at: ts(1), updated_at: ts(1), expires_at: '2020-01-01T00:00:00+00:00', accepted_at: null, revoked_at: null },
    { invitation_id: 'i2', tenant_id: T, employee_id: 's2', status: 'pending', created_at: ts(1), updated_at: ts(1), expires_at: '2999-01-01T00:00:00+00:00', accepted_at: null, revoked_at: null },
  ],
  shiftExchanges: [
    { exchange_id: 'x2', tenant_id: T, location_id: L, shift_id: 'a2', requester_employee_id: 's1', replacement_employee_id: null, reason: 'r', status: 'open', accepted_at: null, decided_at: null, created_at: ts(7), updated_at: ts(7), request_kind: 'exchange', requested_shift_type_id: null },
    { exchange_id: 'x1', tenant_id: T, location_id: L, shift_id: 'a1', requester_employee_id: 's2', replacement_employee_id: 's1', reason: 'q', status: 'accepted', accepted_at: ts(6), decided_at: null, created_at: ts(6), updated_at: ts(6), request_kind: 'change', requested_shift_type_id: 'st2' },
  ],
  exchangeAssignments: assignmentRows,
  staffMessages: [
    { message_id: 'm2', tenant_id: T, location_id: L, employee_id: 's1', sender_role: 'manager', sender_user_id: 'u1', body: 'later', is_read: false, read_at: null, read_by: null, archived_at: null, deleted_at: null, created_at: ts(3), updated_at: ts(3) },
    { message_id: 'm1', tenant_id: T, location_id: L, employee_id: 's1', sender_role: 'weird', sender_user_id: 'u2', body: 'first', is_read: true, read_at: ts(2), read_by: 'u1', archived_at: null, deleted_at: null, created_at: ts(2), updated_at: ts(2) },
  ],
  inventoryItems: [
    { item_id: 'it2', tenant_id: T, location_id: L, name: 'Milk', unit: 'L', required_quantity: '10.000', reorder_point: 3, sort_order: 1, is_active: false, actual_quantity: null, counted_at: null, counted_by_staff_id: null, shortage_quantity: '0', status: 'unknown', media_path: null },
    { item_id: 'it1', tenant_id: T, location_id: L, name: 'Beans', unit: 'kg', required_quantity: 5, reorder_point: 2, sort_order: 1, is_active: true, actual_quantity: '1.500', counted_at: ts(2), counted_by_staff_id: 's1', shortage_quantity: 3.5, status: 'shortage', media_path: 'p/1.jpg' },
  ],
  purchasesNeeded: [
    { item_id: 'it2', tenant_id: T, location_id: L, name: 'Milk', unit: 'L', required_quantity: 10, reorder_point: 3, actual_quantity: 1, shortage_quantity: 9, latest_stock_count_id: 'sc2', purchase_status: 'bought', actioned_at: ts(2), actioned_by_staff_id: 's1', ordered_quantity: null, received_quantity: null },
    { item_id: 'it1', tenant_id: T, location_id: L, name: 'Beans', unit: 'kg', required_quantity: 5, reorder_point: 2, actual_quantity: '0', shortage_quantity: '5', latest_stock_count_id: 'sc1', purchase_status: 'pending', actioned_at: null, actioned_by_staff_id: null, ordered_quantity: null, received_quantity: null },
  ],
  purchaseHistory: [
    { action_id: 'pa2', tenant_id: T, location_id: L, item_id: 'it1', item_name: 'Beans', unit: 'kg', action_type: 'ordered', ordered_quantity: '6', received_quantity: null, actioned_at: ts(3), actioned_by_staff_id: 's1' },
    { action_id: 'pa1', tenant_id: T, location_id: L, item_id: 'it2', item_name: 'Milk', unit: 'L', action_type: 'received', ordered_quantity: null, received_quantity: 2, actioned_at: ts(2), actioned_by_staff_id: null },
  ],
  purchasesAwaiting: [
    { item_id: 'it2', tenant_id: T, location_id: L, name: 'Milk', unit: 'L', required_quantity: 10, reorder_point: 3, actual_quantity: 4, shortage_quantity: 6, is_short: true, latest_stock_count_id: 'sc2', order_action_id: 'pa3', ordered_quantity: 8, received_since_order_quantity: 4, open_order_quantity: 4, ordered_at: ts(4), ordered_by_staff_id: 's1' },
    { item_id: 'it1', tenant_id: T, location_id: L, name: 'Beans', unit: 'kg', required_quantity: 5, reorder_point: 2, actual_quantity: '5', shortage_quantity: '0', is_short: false, latest_stock_count_id: 'sc1', order_action_id: 'pa2', ordered_quantity: '6', received_since_order_quantity: '1', open_order_quantity: '5', ordered_at: ts(3), ordered_by_staff_id: null },
  ],
  recipeCategories: [
    { category_id: 'c2', tenant_id: T, label_ja: 'フード', label_en: null, sort_order: 2, is_active: true },
    { category_id: 'c1', tenant_id: T, label_ja: 'ドリンク', label_en: 'Drinks', sort_order: 1, is_active: false },
  ],
  recipes: [
    { recipe_id: 'rc2', tenant_id: T, location_id: null, recipe_category_id: 'c1', title_ja: 'ラテ', title_en: null, description_ja: null, description_en: null, content_kind: 'recipe', is_popular: false, status: 'published', created_at: ts(1), updated_at: ts(1), media_path: null, original_language: 'ja' },
    { recipe_id: 'rc1', tenant_id: T, location_id: L, recipe_category_id: null, title_ja: null, title_en: 'Opening', description_ja: null, description_en: 'd', content_kind: 'instruction', is_popular: true, status: 'draft', created_at: ts(1), updated_at: ts(1), media_path: 'r/1.jpg', original_language: 'en' },
  ],
  scheduleSettings: [
    { tenant_id: T, location_id: L, required_headcount_by_weekday: [3, 3, 3, 3, 3, 2, 4], max_monthly_hours: 160, max_weekly_hours: 40, max_days_per_week: 5, auto_create_day_of_month: 20, auto_create_enabled: true, auto_create_last_generated_month: null },
  ],
  recipeTitleTranslations: [
    { translation_id: 'tr1', tenant_id: T, source_entity_type: 'workforce_recipe', source_entity_id: 'rc2', source_field: 'title', source_language: 'ja', target_language: 'en', translated_text: 'Latte', translation_status: 'reviewed', translation_provider: 'manual', source_content_hash: 'h', machine_generated: false, reviewed_at: ts(2), translated_at: ts(2), updated_at: ts(2) },
  ],
  myProfile: [
    { staff_id: 's1', tenant_id: T, location_id: L, position_label: '店長', employment_type: 'full_time', is_active: true, created_at: ts(1), hourly_wage_yen: null },
  ],
  operationsTemplates: [
    { template_id: 'ot2', tenant_id: T, location_id: L, name: 'Opening', category: null, description: null, is_active: true, created_at: ts(1), updated_at: ts(1) },
    { template_id: 'ot1', tenant_id: T, location_id: null, name: 'Closing', category: 'Daily', description: 'd', is_active: false, created_at: ts(1), updated_at: ts(1) },
  ],
  operationsItems: [
    { item_id: 'oi2', tenant_id: T, template_id: 'ot1', label: 'Temp', response_type: 'numeric', is_critical: true, is_required: true, is_active: true, numeric_min: 0, numeric_max: 5.5, numeric_unit: '°C', sort_order: 2, created_at: ts(1), updated_at: ts(1) },
    { item_id: 'oi1', tenant_id: T, template_id: 'ot1', label: 'Clean', response_type: 'boolean', is_critical: false, is_required: false, is_active: true, numeric_min: null, numeric_max: null, numeric_unit: null, sort_order: 1, created_at: ts(1), updated_at: ts(1) },
  ],
  operationsSchedules: [
    { schedule_id: 'os2', tenant_id: T, location_id: L, template_id: 'ot1', schedule_group_id: 'g1', recurrence_kind: 'weekdays', weekdays: [1, 3, 5], due_time: '09:00:00', window_end_time: '10:00:00', effective_from: '2026-02-01', effective_to: null, is_active: true, created_at: ts(1), updated_at: ts(1) },
    { schedule_id: 'os1', tenant_id: T, location_id: L, template_id: 'ot2', schedule_group_id: 'g2', recurrence_kind: 'daily', weekdays: null, due_time: '08:00:00', window_end_time: null, effective_from: '2026-01-01', effective_to: '2026-01-31', is_active: false, created_at: ts(1), updated_at: ts(1) },
  ],
  operationsTodayTasks: [
    { schedule_id: 'os1', schedule_group_id: 'g2', tenant_id: T, location_id: L, template_id: 'ot2', template_name: 'Opening', category: null, business_date: '2026-01-10', due_time: '08:00:00', window_end_time: null, window_close_at: ts(10), instance_id: null, status: null, state: 'overdue', is_overdue_critical: true, open_exception_count: 1, completed_at: null },
    { schedule_id: 'os9', schedule_group_id: null, tenant_id: 'other-tenant', location_id: 'loc-9', template_id: 'ot9', template_name: 'Other', category: null, business_date: '2026-01-10', due_time: '08:00:00', window_end_time: null, window_close_at: ts(10), instance_id: 'in9', status: 'completed', state: 'completed', is_overdue_critical: false, open_exception_count: 0, completed_at: ts(10) },
  ],
  operationsOpenExceptions: [
    { exception_id: 'oe1', tenant_id: T, location_id: L, instance_id: null, schedule_id: 'os1', business_date: '2026-01-09', item_id: null, severity: 'action_required', source: 'critical_missed', note: null, created_at: ts(9), template_name: 'Opening' },
    { exception_id: 'oe2', tenant_id: T, location_id: L, instance_id: 'in1', schedule_id: null, business_date: null, item_id: 'oi2', severity: 'warning', source: 'threshold', note: 'hot', created_at: ts(10), template_name: 'Closing' },
  ],
  issuesOpen: [
    { issue_id: 'is1', tenant_id: T, location_id: L, kind: 'issue', category: 'equipment', severity: 'normal', status: 'open', note: 'a', business_date: '2026-01-05', reported_by: 'u1', reported_by_role: 'staff', acknowledged_by: null, acknowledged_at: null, source: 'manual', operations_exception_id: null, created_at: ts(5), updated_at: ts(5), reporter_employee_id: 's1' },
    { issue_id: 'is2', tenant_id: T, location_id: L, kind: 'handover', category: null, severity: null, status: 'acknowledged', note: 'b', business_date: '2026-01-06', reported_by: 'u2', reported_by_role: 'manager', acknowledged_by: 'u2', acknowledged_at: ts(6), source: 'operations', operations_exception_id: 'oe1', created_at: ts(6), updated_at: ts(6), reporter_employee_id: null },
  ],
  issuesAll: [
    { issue_id: 'is3', tenant_id: T, location_id: L, kind: 'issue', category: 'cleaning', severity: 'important', status: 'resolved', note: 'c', business_date: '2026-01-04', reported_by: 'u1', reported_by_role: 'staff', acknowledged_by: 'u2', acknowledged_at: ts(4), resolved_by: 'u2', resolved_at: ts(5), resolution_note: 'done', source: 'manual', operations_exception_id: null, created_at: ts(4), updated_at: ts(5), reporter_employee_id: 's1' },
    { issue_id: 'is1', tenant_id: T, location_id: L, kind: 'issue', category: 'equipment', severity: 'normal', status: 'open', note: 'a', business_date: '2026-01-05', reported_by: 'u1', reported_by_role: 'staff', acknowledged_by: null, acknowledged_at: null, resolved_by: null, resolved_at: null, resolution_note: null, source: 'manual', operations_exception_id: null, created_at: ts(5), updated_at: ts(5), reporter_employee_id: 's1' },
  ],
  autoScheduleRuns: [
    { run_id: 'ar2', target_month: '2026-03-01', outcome: 'failed', created_count: 0, shortage_count: 0, error_code: 'apply_failed', attempt_count: 2, last_seen_at: ts(9) },
    { run_id: 'ar1', target_month: '2026-02-01', outcome: 'generated', created_count: 12, shortage_count: 1, error_code: null, attempt_count: 1, last_seen_at: ts(8) },
  ],
};

/** What each existing lib function returns when its read yields `rows` (the stub serves them for every request it makes). */
const LIB: Record<Exclude<ManagerDashboardPart, 'staff'>, (rows: Record<string, unknown>[]) => Promise<unknown>> = {
  lineLinks: (r) => listEmployeeLineLinks(recordingClient({ data: r, error: null }).client, T),
  shiftTypes: (r) => listWorkforceShiftTypes(recordingClient({ data: r, error: null }).client, T),
  preferenceRequests: (r) => listShiftRequestsForManager(recordingClient({ data: r, error: null }).client, T, { kind: 'preference', fromDate: '2025-11-01' }),
  assignments: (r) => listShiftAssignments(recordingClient({ data: r, error: null }).client, T, { fromIso: ts(5), toIsoExclusive: ts(12) }),
  correctionRequests: (r) => listShiftRequestsForManager(recordingClient({ data: r, error: null }).client, T, { kind: 'correction' }),
  attendance: (r) => listAttendanceForManager(recordingClient({ data: r, error: null }).client, T, { fromDate: '2025-12-01', toDate: '2026-01-31' }),
  invitations: (r) => listWorkforceEmployeeInvitations(recordingClient({ data: r, error: null }).client, T),
  shiftExchanges: (r) => listShiftExchanges(recordingClient({ data: r, error: null }).client, T, L),
  exchangeAssignments: (r) => listShiftAssignments(recordingClient({ data: r, error: null }).client, T, {}),
  staffMessages: (r) => listStaffMessagesForManager(recordingClient({ data: r, error: null }).client, T),
  inventoryItems: (r) => listInventoryItemStatus(recordingClient({ data: r, error: null }).client, T, L, { includeInactive: true }),
  purchasesNeeded: (r) => listPurchasesNeeded(recordingClient({ data: r, error: null }).client, T, L),
  purchaseHistory: (r) => listPurchaseHistory(recordingClient({ data: r, error: null }).client, T, L),
  purchasesAwaiting: (r) => listPurchasesAwaitingDelivery(recordingClient({ data: r, error: null }).client, T, L),
  recipeCategories: (r) => listWorkforceRecipeCategories(recordingClient({ data: r, error: null }).client, T),
  recipes: (r) => listWorkforceRecipes(recordingClient({ data: r, error: null }).client, T),
  // maybeSingle: the single read gets one object (or null), not a list
  scheduleSettings: (r) => getWorkforceScheduleSettings(recordingClient({ data: r[0] ?? null, error: null }).client, T, L),
  recipeTitleTranslations: (r) => listContentTranslationsForField(recordingClient({ data: r, error: null }).client, T, 'workforce_recipe', 'title'),
  myProfile: (r) => getMyWorkforceStaffProfile(recordingClient({ data: r[0] ?? null, error: null }).client, T),
  operationsTemplates: (r) => listOperationsTemplates(recordingClient({ data: r, error: null }).client, T),
  operationsItems: (r) => listOperationsTemplateItems(recordingClient({ data: r, error: null }).client, T),
  operationsSchedules: (r) => listOperationsSchedules(recordingClient({ data: r, error: null }).client, T),
  operationsTodayTasks: (r) => listExpectedTasks(recordingClient({ data: r, error: null }).client, T, '2026-01-10'),
  operationsOpenExceptions: (r) => listOpenOperationsExceptions(recordingClient({ data: r, error: null }).client, T),
  issuesOpen: (r) => listOpenIssues(recordingClient({ data: r, error: null }).client, T),
  issuesAll: (r) => listAllIssues(recordingClient({ data: r, error: null }).client, T),
  autoScheduleRuns: (r) => listRecentAutoScheduleRuns(recordingClient({ data: r, error: null }).client, T, L),
};

const PARAMS = {
  preferenceFromDate: '2025-11-01',
  fromIso: ts(5),
  toIsoExclusive: ts(12),
  exchangeFromIso: '2025-11-01T00:00:00.000Z',
  exchangeToIsoExclusive: '2026-03-01T00:00:00.000Z',
  attendanceFromDate: '2025-12-01',
  attendanceToDate: '2026-01-31',
  today: '2026-01-10',
};

function fullBundle(): Record<string, unknown> {
  const bundle: Record<string, unknown> = { staff: { rows: staffRows, protectedHistoryIds: ['s2'] } };
  for (const [part, rows] of Object.entries(ROWS)) bundle[part] = { rows };
  return bundle;
}

test('loadManagerDashboard sends ONE api.manager_dashboard call with the requested parts and inputs', async () => {
  const calls: unknown[] = [];
  await loadManagerDashboard(rpcClient({ data: {} }, calls), T, L, { parts: ['shiftTypes', 'staff', 'shiftTypes'], ...PARAMS });
  assert.deepEqual(calls, [
    { schema: 'api', fn: 'manager_dashboard', args: { p_tenant_id: T, p_location_id: L, p_params: { ...PARAMS, parts: ['shiftTypes', 'staff'] } } },
  ]);
});

test('every part maps to exactly what its lib function returns for the same rows', async () => {
  const result = await loadManagerDashboard(rpcClient({ data: fullBundle() }), T, L, { parts: MANAGER_DASHBOARD_PARTS, ...PARAMS });
  for (const [part, rows] of Object.entries(ROWS) as [Exclude<ManagerDashboardPart, 'staff'>, Record<string, unknown>[]][]) {
    const expected = await LIB[part](rows);
    assert.equal((expected as { status: string }).status, 'success', `${part}: the lib function succeeds on these rows`);
    assert.deepEqual(result[part], expected, `${part} equals the lib function's result`);
  }
  // staff: roster read + the four protected-history reads (only s2 has history)
  const staffExpected = await listWorkforceStaffForManager(
    recordingClient([
      { data: staffRows, error: null },
      { data: [{ employee_id: 's2' }], error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
    ]).client,
    T,
  );
  assert.equal(staffExpected.status, 'success');
  assert.deepEqual(result.staff, staffExpected, 'staff equals listWorkforceStaffForManager (decrypted, sorted, hasProtectedHistory)');
  if (result.staff.status === 'success') {
    assert.deepEqual(result.staff.data.map((s) => [s.name, s.hasProtectedHistory]), [['Aoki', false], ['Yamada', true]]);
  }
});

test('empty parts map like empty reads (maybeSingle parts -> null)', async () => {
  const bundle: Record<string, unknown> = {};
  for (const part of MANAGER_DASHBOARD_PARTS) bundle[part] = { rows: [] };
  const result = await loadManagerDashboard(rpcClient({ data: bundle }), T, L, { parts: MANAGER_DASHBOARD_PARTS, ...PARAMS });
  assert.deepEqual(result.scheduleSettings, { status: 'success', data: null });
  assert.deepEqual(result.myProfile, { status: 'success', data: null });
  assert.deepEqual(result.staff, { status: 'success', data: [] });
  assert.deepEqual(result.issuesAll, { status: 'success', data: [] });
});

test('a maybeSingle part with two rows fails like postgrest-js maybeSingle (PGRST116)', async () => {
  const row = ROWS.scheduleSettings[0];
  const profile = ROWS.myProfile[0];
  const result = await loadManagerDashboard(
    rpcClient({ data: { scheduleSettings: { rows: [row, row] }, myProfile: { rows: [profile, profile] } } }),
    T,
    L,
    { parts: ['scheduleSettings', 'myProfile'], ...PARAMS },
  );
  assert.deepEqual(result.scheduleSettings, { status: 'unexpected_error', message: 'JSON object requested, multiple (or no) rows returned' });
  assert.deepEqual(result.myProfile, { status: 'unexpected_error', message: 'JSON object requested, multiple (or no) rows returned' });
});

test('a part error becomes that part\'s own error result; the other parts still succeed', async () => {
  const bundle = fullBundle();
  bundle.shiftTypes = { error: { code: '42501', message: 'permission denied for view workforce_shift_types' } };
  bundle.inventoryItems = { error: { code: 'XX000', message: 'internal detail' } };
  bundle.staffMessages = { error: { code: 'LBO_ROW_CAP', message: 'List read exceeds 20000 rows; refusing to return a partial list (DEBT-114).' } };
  const result = await loadManagerDashboard(rpcClient({ data: bundle }), T, L, { parts: MANAGER_DASHBOARD_PARTS, ...PARAMS });

  assert.deepEqual(result.shiftTypes, await listWorkforceShiftTypes(recordingClient({ data: null, error: { code: '42501', message: 'permission denied for view workforce_shift_types' } }).client, T));
  assert.deepEqual(result.shiftTypes, { status: 'unauthorized', message: 'Not permitted to read shift types.' });
  assert.deepEqual(result.inventoryItems, { status: 'unexpected_error', message: 'Unable to load inventory data right now.' });
  assert.deepEqual(result.staffMessages, {
    status: 'unexpected_error',
    message: 'List read exceeds 20000 rows; refusing to return a partial list (DEBT-114).',
  });
  assert.equal(result.lineLinks.status, 'success');
  assert.equal(result.staff.status, 'success');
});

test('a whole-RPC error fails every requested part closed, each with its own error mapping', async () => {
  const result = await loadManagerDashboard(
    rpcClient({ error: { code: '42501', message: 'permission denied for function manager_dashboard' } }),
    T,
    L,
    { parts: MANAGER_DASHBOARD_PARTS, ...PARAMS },
  );
  for (const part of MANAGER_DASHBOARD_PARTS) assert.equal(result[part].status, 'unauthorized', `${part} is unauthorized`);
  assert.deepEqual(result.recipes, { status: 'unauthorized', message: 'Not permitted to read workforce recipes.' });

  const other = await loadManagerDashboard(rpcClient({ error: { code: 'PGRST202', message: 'Could not find the function' } }), T, L, {
    parts: ['attendance', 'purchasesNeeded'],
    ...PARAMS,
  });
  assert.deepEqual(other.attendance, { status: 'unexpected_error', message: 'Could not find the function' });
  assert.deepEqual(other.purchasesNeeded, { status: 'unexpected_error', message: 'Unable to load purchases data right now.' });
});

test('a throw, a bad payload or a missing part fails closed to unexpected_error', async () => {
  const thrown = await loadManagerDashboard(
    rpcClient(() => {
      throw new Error('network down');
    }),
    T,
    L,
    { parts: ['shiftTypes', 'issuesOpen'], ...PARAMS },
  );
  assert.deepEqual(thrown.shiftTypes, { status: 'unexpected_error', message: 'network down' });
  assert.deepEqual(thrown.issuesOpen, { status: 'unexpected_error', message: 'network down' });

  for (const data of [null, 'nope', [1, 2]]) {
    const bad = await loadManagerDashboard(rpcClient({ data }), T, L, { parts: ['shiftTypes'], ...PARAMS });
    assert.equal(bad.shiftTypes.status, 'unexpected_error');
  }

  const missing = await loadManagerDashboard(rpcClient({ data: { shiftTypes: { rows: ROWS.shiftTypes }, lineLinks: { rows: 'x' } } }), T, L, {
    parts: ['shiftTypes', 'lineLinks', 'recipes'],
    ...PARAMS,
  });
  assert.equal(missing.shiftTypes.status, 'success');
  assert.equal(missing.lineLinks.status, 'unexpected_error');
  assert.equal(missing.recipes.status, 'unexpected_error');
});

test('a part that was not requested is never a success, even if the payload carries it', async () => {
  const result = await loadManagerDashboard(rpcClient({ data: fullBundle() }), T, L, { parts: ['shiftTypes'], ...PARAMS });
  assert.equal(result.shiftTypes.status, 'success');
  assert.equal(result.inventoryItems.status, 'unexpected_error');
  assert.equal(result.staff.status, 'unexpected_error');
});

test('missing PII env -> staff is config_error (as listWorkforceStaffForManager), other parts unaffected', async () => {
  const saved = process.env.PII_ENCRYPTION_KEY;
  delete process.env.PII_ENCRYPTION_KEY;
  try {
    const result = await loadManagerDashboard(rpcClient({ data: fullBundle() }), T, L, { parts: ['staff', 'shiftTypes'], ...PARAMS });
    assert.deepEqual(result.staff, await listWorkforceStaffForManager(recordingClient({ data: [], error: null }).client, T));
    assert.equal(result.staff.status, 'config_error');
    assert.equal(result.shiftTypes.status, 'success');
  } finally {
    process.env.PII_ENCRYPTION_KEY = saved;
  }
});

test('a row that cannot be decrypted fails only the staff part', async () => {
  const bundle = fullBundle();
  bundle.staff = { rows: [{ ...staffRows[0], name_encrypted: '\\x00' }], protectedHistoryIds: [] };
  const result = await loadManagerDashboard(rpcClient({ data: bundle }), T, L, { parts: ['staff', 'shiftTypes'], ...PARAMS });
  assert.equal(result.staff.status, 'unexpected_error');
  assert.equal(result.shiftTypes.status, 'success');
});
