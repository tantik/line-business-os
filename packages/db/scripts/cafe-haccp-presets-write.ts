/**
 * `oruwa-cafe` Cafe HACCP checklist presets WRITE-side executor (Cafe v2.2
 * WP1 Operations, D3/D5).
 *
 * Resolves live tenant state, builds the plan via the pure
 * `buildCafeHaccpPresetsPlan` (see `cafe-haccp-presets.ts` -- read that
 * file's module doc comment first for the full governance notes on the
 * numeric ranges, the HACCP-certification boundary, and the corrective
 * action / recheck capability mapping), prints it, and only actually writes
 * when `--confirm-apply` is passed -- the same dry-run-by-default safety
 * convention `oruwa-cafe-fixture-write.ts` established. Re-running without
 * `--confirm-apply` is always safe (read-only).
 *
 * EVERY WRITE GOES THROUGH THE EXISTING `api.operations_*` RPCs (0105) via a
 * real authenticated Manager-session client -- never a raw `operations.*`
 * table write, never a service-role bypass. Every `api.operations_*` write
 * RPC is `SECURITY INVOKER` and internally calls `core.current_user_id()` /
 * `core.has_permission_in_tenant(...)` to resolve the acting user and check
 * `operations.template.manage` -- a service-role call has no acting user and
 * would fail this, so the manager sign-in below (`ORUWA_CAFE_MANAGER_PASSWORD`
 * against `manager@oruwa-cafe.test`) is required, not optional. The three
 * read views (`api.operations_templates` / `api.operations_template_items` /
 * `api.operations_schedules`) are likewise permission-gated the same way, so
 * they are also read via the manager client, not service-role.
 *
 * CONNECTION -- this targets whatever `SUPABASE_URL` / `SUPABASE_SECRET_KEY` /
 * `SUPABASE_PUBLISHABLE_KEY` currently resolve to (local or the linked Cloud
 * dev project), same operator-controlled-target convention as
 * `oruwa-cafe-fixture-write.ts`. Treat running this with `--confirm-apply` as
 * a real data write against whatever database is currently configured.
 *
 * IDS -- reused verbatim from `oruwa-cafe-fixture-write.ts` (already
 * documented/verified there against
 * `docs/ai/ORUWA_CAFE_V2_1_REFERENCE_TENANT_REPORT_2026-08-14.md` §8-9/§15).
 */
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { createUserClient } from '../src/client.js';
import { serverEnv } from '@line-os/config/env';
import {
  CAFE_HACCP_PRESETS_MANIFEST,
  buildCafeHaccpPresetsPlan,
  type CafeHaccpPresetsContext,
  type CafeHaccpPresetsExistingTemplate,
  type CafeHaccpPresetsPlan,
} from './cafe-haccp-presets.js';

/** From `oruwa-cafe-fixture-write.ts` -- re-verify against `docs/ai/ORUWA_CAFE_V2_1_REFERENCE_TENANT_REPORT_2026-08-14.md` §8-9/§15 if this tool ever fails to find the tenant. */
const ORUWA_CAFE_TENANT_ID = '72b81b2f-9ba5-4a4a-a296-02e32d4682b8';
const ORUWA_CAFE_LOCATION_ID = '4bad308e-f8d3-4c20-a158-b6eb3bafa71b';
/** The manager test identity used for every operations_* write in this tool, since every write RPC is SECURITY INVOKER and resolves the acting user from the JWT -- see module doc comment. */
const ORUWA_CAFE_MANAGER_EMAIL = 'manager@oruwa-cafe.test';

let cachedManagerClient: ReturnType<typeof createUserClient> | null = null;

/** Signs in as the manager test account once per process run and returns an authenticated client -- see this file's module doc comment for why every operations_* read/write here needs a real acting user instead of a service-role client. */
async function getManagerClient(): Promise<ReturnType<typeof createUserClient>> {
  if (cachedManagerClient) return cachedManagerClient;
  const env = serverEnv();
  const managerPassword = process.env.ORUWA_CAFE_MANAGER_PASSWORD;
  if (!managerPassword) {
    throw new Error(
      'ORUWA_CAFE_MANAGER_PASSWORD env var is required (used to read the existing Operations templates/items/schedules and, on --confirm-apply, to create the HACCP preset templates/items/schedules -- see this file\'s module doc comment for why a service-role call cannot do either).',
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

interface ApiOperationsTemplateRow {
  template_id: string;
  location_id: string | null;
  name: string;
}
interface ApiOperationsTemplateItemRow {
  template_id: string;
  label: string;
}
interface ApiOperationsScheduleRow {
  template_id: string;
  location_id: string;
}

async function resolveContext(): Promise<CafeHaccpPresetsContext> {
  const managerClient = await getManagerClient();

  const { data: templateRows, error: templatesError } = await managerClient
    .schema('api')
    .from('operations_templates')
    .select('template_id, location_id, name')
    .eq('tenant_id', ORUWA_CAFE_TENANT_ID);
  if (templatesError) throw new Error(`Failed to read oruwa-cafe's existing Operations templates: ${templatesError.message}`);

  const { data: itemRows, error: itemsError } = await managerClient
    .schema('api')
    .from('operations_template_items')
    .select('template_id, label')
    .eq('tenant_id', ORUWA_CAFE_TENANT_ID);
  if (itemsError) throw new Error(`Failed to read oruwa-cafe's existing Operations template items: ${itemsError.message}`);

  const { data: scheduleRows, error: schedulesError } = await managerClient
    .schema('api')
    .from('operations_schedules')
    .select('template_id, location_id')
    .eq('tenant_id', ORUWA_CAFE_TENANT_ID);
  if (schedulesError) throw new Error(`Failed to read oruwa-cafe's existing Operations schedules: ${schedulesError.message}`);

  const templates = (templateRows ?? []) as ApiOperationsTemplateRow[];
  const items = (itemRows ?? []) as ApiOperationsTemplateItemRow[];
  const schedules = (scheduleRows ?? []) as ApiOperationsScheduleRow[];

  const existingTemplates: CafeHaccpPresetsExistingTemplate[] = templates.map((t) => ({
    templateId: t.template_id,
    name: t.name,
    locationId: t.location_id,
    itemLabels: items.filter((i) => i.template_id === t.template_id).map((i) => i.label),
    hasScheduleAtLocation: schedules.some((s) => s.template_id === t.template_id && s.location_id === ORUWA_CAFE_LOCATION_ID),
  }));

  return {
    tenantId: ORUWA_CAFE_TENANT_ID,
    locationId: ORUWA_CAFE_LOCATION_ID,
    existingTemplates,
  };
}

function printPlan(plan: CafeHaccpPresetsPlan): void {
  console.log('cafe-haccp-presets plan:');
  console.log(`  templates to create: ${plan.templatesToCreate.length}`);
  console.log(`  items to create:     ${plan.itemsToCreate.length}`);
  console.log(`  schedules to create: ${plan.schedulesToCreate.length}`);
  if (plan.skipped.length > 0) {
    console.log('  skipped:');
    for (const reason of plan.skipped) console.log(`    - ${reason}`);
  }
}

async function applyPlan(plan: CafeHaccpPresetsPlan): Promise<void> {
  const managerClient = await getManagerClient();

  // Resolve/created template ids by canonical name, so items/schedules below
  // (which only know the template's NAME from the pure plan) can attach to
  // the right template_id whether it was just created or already existed.
  const templateIdByName = new Map<string, string>();

  for (const template of CAFE_HACCP_PRESETS_MANIFEST.templates) {
    const toCreate = plan.templatesToCreate.find((t) => t.name === template.name);
    if (!toCreate) continue; // already existed -- resolved via the pre-fetch below.
    const { data, error } = await managerClient.schema('api').rpc('operations_create_template', {
      p_tenant_id: ORUWA_CAFE_TENANT_ID,
      p_name: toCreate.name,
      p_location_id: toCreate.locationId,
      p_category: toCreate.category,
      p_description: null,
    });
    if (error) throw new Error(`Failed to create HACCP template "${toCreate.name}": ${error.message}`);
    const templateId = String(data);
    templateIdByName.set(toCreate.name, templateId);
    console.log(`  created template ${templateId} (${toCreate.name})`);

    const itemsForTemplate = plan.itemsToCreate.filter((i) => i.templateName === template.name);
    for (const item of itemsForTemplate) {
      const { data: itemData, error: itemError } = await managerClient.schema('api').rpc('operations_add_template_item', {
        p_tenant_id: ORUWA_CAFE_TENANT_ID,
        p_template_id: templateId,
        p_label: item.label,
        p_response_type: item.responseType,
        p_is_critical: item.isCritical,
        p_is_required: item.isRequired,
        p_numeric_min: item.numericMin,
        p_numeric_max: item.numericMax,
        p_numeric_unit: item.numericUnit,
        p_sort_order: item.sortOrder,
      });
      if (itemError) throw new Error(`Failed to add HACCP item "${item.label}" to template "${template.name}": ${itemError.message}`);
      console.log(`    added item ${String(itemData)} (${item.label})`);
    }

    const scheduleForTemplate = plan.schedulesToCreate.find((s) => s.templateName === template.name);
    if (scheduleForTemplate) {
      const { data: scheduleData, error: scheduleError } = await managerClient.schema('api').rpc('operations_create_schedule', {
        p_tenant_id: ORUWA_CAFE_TENANT_ID,
        p_location_id: scheduleForTemplate.locationId,
        p_template_id: templateId,
        p_recurrence_kind: scheduleForTemplate.recurrenceKind,
        p_due_time: scheduleForTemplate.dueTime,
        p_weekdays: null,
        p_window_end_time: scheduleForTemplate.windowEndTime,
      });
      if (scheduleError) throw new Error(`Failed to create schedule for HACCP template "${template.name}": ${scheduleError.message}`);
      console.log(`    created schedule ${String(scheduleData)} for template "${template.name}"`);
    }
  }

  // Templates that already existed still need their newly-planned items and
  // schedule applied, resolved via the pre-fetched context's template ids.
  // (Items/schedules planned against a pre-existing template are the only
  // remaining ones not yet processed above.)
  for (const template of CAFE_HACCP_PRESETS_MANIFEST.templates) {
    if (templateIdByName.has(template.name)) continue; // handled above (freshly created).
    const itemsForTemplate = plan.itemsToCreate.filter((i) => i.templateName === template.name);
    const scheduleForTemplate = plan.schedulesToCreate.find((s) => s.templateName === template.name);
    if (itemsForTemplate.length === 0 && !scheduleForTemplate) continue; // nothing left to do for this template.

    const { data: existingRows, error: existingError } = await managerClient
      .schema('api')
      .from('operations_templates')
      .select('template_id')
      .eq('tenant_id', ORUWA_CAFE_TENANT_ID)
      .eq('name', template.name)
      .eq('location_id', ORUWA_CAFE_LOCATION_ID)
      .limit(1)
      .maybeSingle();
    if (existingError) throw new Error(`Failed to resolve existing template id for "${template.name}": ${existingError.message}`);
    const existingTemplateId = (existingRows as { template_id: string } | null)?.template_id;
    if (!existingTemplateId) throw new Error(`Plan bug: template "${template.name}" was expected to already exist but was not found.`);

    for (const item of itemsForTemplate) {
      const { data: itemData, error: itemError } = await managerClient.schema('api').rpc('operations_add_template_item', {
        p_tenant_id: ORUWA_CAFE_TENANT_ID,
        p_template_id: existingTemplateId,
        p_label: item.label,
        p_response_type: item.responseType,
        p_is_critical: item.isCritical,
        p_is_required: item.isRequired,
        p_numeric_min: item.numericMin,
        p_numeric_max: item.numericMax,
        p_numeric_unit: item.numericUnit,
        p_sort_order: item.sortOrder,
      });
      if (itemError) throw new Error(`Failed to add HACCP item "${item.label}" to existing template "${template.name}": ${itemError.message}`);
      console.log(`    added item ${String(itemData)} (${item.label}) to existing template ${existingTemplateId}`);
    }

    if (scheduleForTemplate) {
      const { data: scheduleData, error: scheduleError } = await managerClient.schema('api').rpc('operations_create_schedule', {
        p_tenant_id: ORUWA_CAFE_TENANT_ID,
        p_location_id: scheduleForTemplate.locationId,
        p_template_id: existingTemplateId,
        p_recurrence_kind: scheduleForTemplate.recurrenceKind,
        p_due_time: scheduleForTemplate.dueTime,
        p_weekdays: null,
        p_window_end_time: scheduleForTemplate.windowEndTime,
      });
      if (scheduleError) throw new Error(`Failed to create schedule for existing HACCP template "${template.name}": ${scheduleError.message}`);
      console.log(`    created schedule ${String(scheduleData)} for existing template "${template.name}"`);
    }
  }
}

async function main(): Promise<void> {
  const confirmApply = process.argv.includes('--confirm-apply');

  const context = await resolveContext();
  const plan = buildCafeHaccpPresetsPlan(CAFE_HACCP_PRESETS_MANIFEST, context);
  printPlan(plan);

  if (!confirmApply) {
    console.log('\nDry run only -- nothing was written. Re-run with --confirm-apply to write for real.');
    return;
  }

  const totalWrites = plan.templatesToCreate.length + plan.itemsToCreate.length + plan.schedulesToCreate.length;
  if (totalWrites === 0) {
    console.log('\nNothing to write (every HACCP preset already installed).');
    return;
  }

  console.log('\nApplying plan...');
  await applyPlan(plan);
  console.log('\nDone.');
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((err) => {
    console.error('cafe-haccp-presets-write failed:', err instanceof Error ? err.message : err);
    // Set exitCode (not process.exit()) so pending libuv handles (open network
    // sockets from the Supabase client) drain naturally instead of forcing an
    // abrupt shutdown -- see the equivalent comment in oruwa-cafe-fixture-write.ts.
    process.exitCode = 1;
  });
}
