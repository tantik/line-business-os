-- ============================================================================
-- DB test: migration 0133 (tenant provisioning in one transaction, 4B-1).
-- Run with:  pnpm exec supabase db reset && pnpm exec supabase test db
--   A  grants: only service_role can execute; the status table is closed
--   B  a non-staff actor is refused and nothing is written
--   C  happy path: tenant, location, trial plan, package modules, settings,
--      shift types, HACCP checklists, status db_done, one audit row
--   D  idempotent re-run with the same request_id
--   E  slug conflict with another request (or an existing tenant)
--   F  forced failure mid-way rolls back everything; validation refusals
--   G  failed_db record, then a retry of the same request succeeds
--   H  rate limit (20 per platform user per hour)
-- ============================================================================
begin;

create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, audit;

select no_plan();

insert into core.users (id, display_name, is_platform_staff) values
  ('b1330000-0000-0000-0000-000000000001', 'ORUWA staff', true),
  ('b1330000-0000-0000-0000-000000000002', 'Not staff', false),
  ('b1330000-0000-0000-0000-000000000003', 'ORUWA staff 2', true);

create function pg_temp.payload(p_slug text) returns jsonb language sql as $$
  select jsonb_build_object(
    'slug', p_slug,
    'business_name', 'pgTAP Cafe ' || p_slug,
    'location', jsonb_build_object('name', '本店', 'timezone', 'Asia/Tokyo'),
    'plan', jsonb_build_object('code', 'trial', 'trial_days', 30),
    'package_code', 'cafe',
    'template_version', 3,
    'schedule_settings', jsonb_build_object(
      'required_headcount_by_weekday', jsonb_build_array(1, 2, 2, 2, 2, 2, 1),
      'max_monthly_hours', 160, 'max_weekly_hours', 40, 'max_days_per_week', 5,
      'auto_create_day_of_month', 15, 'auto_create_enabled', false),
    'shift_types', jsonb_build_array(
      jsonb_build_object('code', 'EARLY', 'label_ja', '早番', 'label_en', 'Early', 'starts_at_local', '07:00', 'ends_at_local', '12:00', 'sort_order', 1),
      jsonb_build_object('code', 'MID',   'label_ja', '中番', 'label_en', 'Middle', 'starts_at_local', '10:00', 'ends_at_local', '14:00', 'sort_order', 2),
      jsonb_build_object('code', 'LATE',  'label_ja', '遅番', 'label_en', 'Late', 'starts_at_local', '12:00', 'ends_at_local', '17:00', 'sort_order', 3)),
    'operations', jsonb_build_object(
      'manifest_version', 1,
      'templates', jsonb_build_array(
        jsonb_build_object('name', 'オープニング衛生チェック', 'category', 'オープニング', 'due_time', '07:30', 'window_end_time', '08:30',
          'recurrence_kind', 'daily', 'items', jsonb_build_array(
            jsonb_build_object('label', '手洗い設備', 'response_type', 'boolean', 'is_critical', false, 'is_required', true,
                               'numeric_min', null, 'numeric_max', null, 'numeric_unit', null),
            jsonb_build_object('label', '冷蔵庫温度', 'response_type', 'numeric', 'is_critical', true, 'is_required', true,
                               'numeric_min', 0, 'numeric_max', 5, 'numeric_unit', '°C'))),
        jsonb_build_object('name', '温度管理チェック', 'category', '温度管理', 'due_time', '13:00', 'window_end_time', '14:00',
          'recurrence_kind', 'daily', 'items', jsonb_build_array(
            jsonb_build_object('label', '冷凍庫温度', 'response_type', 'numeric', 'is_critical', true, 'is_required', true,
                               'numeric_min', null, 'numeric_max', -15, 'numeric_unit', '°C'),
            jsonb_build_object('label', '温蔵機器温度', 'response_type', 'numeric', 'is_critical', true, 'is_required', false,
                               'numeric_min', 65, 'numeric_max', null, 'numeric_unit', '°C'))))));
$$;

-- Global row counts of every table provisioning writes (unchanged = nothing written).
create function pg_temp.snapshot() returns text language sql as $$
  select concat_ws(',',
    (select count(*) from core.tenants), (select count(*) from core.locations),
    (select count(*) from core.tenant_plans), (select count(*) from core.tenant_packages),
    (select count(*) from core.tenant_modules), (select count(*) from workforce.schedule_settings),
    (select count(*) from workforce.shift_types), (select count(*) from operations.checklist_templates),
    (select count(*) from operations.checklist_items), (select count(*) from operations.task_schedules),
    (select count(*) from core.tenant_provisioning), (select count(*) from audit.audit_logs));
$$;

create function pg_temp.svc(p_sql text) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  set local role service_role;
  execute p_sql into v;
  reset role;
  return v;
end $$;

create function pg_temp.svc_err(p_sql text) returns text language plpgsql as $$
begin
  set local role service_role;
  execute p_sql;
  reset role;
  return 'ok';
exception when others then
  reset role;
  return sqlstate || ' ' || sqlerrm;
end $$;

create function pg_temp.auth_err(p_role text, p_sql text) returns text language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', 'b1330000-0000-0000-0000-000000000001', true);
  execute format('set local role %I', p_role);
  execute p_sql;
  reset role;
  return 'ok';
exception when others then
  reset role;
  return sqlstate;
end $$;

-- A: grants ------------------------------------------------------------------------
select is(has_function_privilege('authenticated', 'core.provision_tenant(uuid, jsonb, uuid)', 'execute'), false, 'A: authenticated cannot execute core.provision_tenant');
select is(has_function_privilege('anon', 'core.provision_tenant(uuid, jsonb, uuid)', 'execute'), false, 'A: anon cannot execute core.provision_tenant');
select is(has_function_privilege('authenticated', 'api.provision_tenant(uuid, jsonb, uuid)', 'execute'), false, 'A: authenticated cannot execute api.provision_tenant');
select is(has_function_privilege('anon', 'api.provision_tenant(uuid, jsonb, uuid)', 'execute'), false, 'A: anon cannot execute api.provision_tenant');
select is(has_function_privilege('authenticated', 'core.mark_provisioning_failed(uuid, text, text, uuid)', 'execute'), false, 'A: authenticated cannot mark failures');
select is(has_function_privilege('anon', 'api.mark_provisioning_failed(uuid, text, text, uuid)', 'execute'), false, 'A: anon cannot mark failures');
select is(has_function_privilege('service_role', 'api.provision_tenant(uuid, jsonb, uuid)', 'execute'), true, 'A: service_role can execute api.provision_tenant');
select is(has_function_privilege('authenticated', 'core.validate_provisioning_payload(jsonb)', 'execute'), false, 'A: internal validator not callable by authenticated');
select is(has_table_privilege('authenticated', 'core.tenant_provisioning', 'select'), false, 'A: authenticated cannot read the status table');
select is(has_table_privilege('anon', 'core.tenant_provisioning', 'select'), false, 'A: anon cannot read the status table');
select is(has_table_privilege('service_role', 'core.tenant_provisioning', 'insert'), false, 'A: service_role writes only through the functions');
select is((select relrowsecurity from pg_class where oid = 'core.tenant_provisioning'::regclass), true, 'A: RLS enabled on the status table');
select is((select prosecdef from pg_proc where oid = 'api.provision_tenant(uuid, jsonb, uuid)'::regprocedure), false, 'A: api wrapper is SECURITY INVOKER (ADR 0008)');
select is(pg_temp.auth_err('authenticated', $$ select api.provision_tenant('b1330000-0000-0000-0000-0000000000a1', pg_temp.payload('pgtap-0133-a'), 'b1330000-0000-0000-0000-000000000001') $$),
  '42501', 'A: a signed-in platform-staff browser session still cannot call it');
select is(pg_temp.auth_err('anon', $$ select api.provision_tenant('b1330000-0000-0000-0000-0000000000a1', pg_temp.payload('pgtap-0133-a'), 'b1330000-0000-0000-0000-000000000001') $$),
  '42501', 'A: anon cannot call it');

-- B: non-staff actor ---------------------------------------------------------------------
create temp table snap (label text primary key, v text);
insert into snap values ('before_b', pg_temp.snapshot());
select matches(pg_temp.svc_err($$ select api.provision_tenant('b1330000-0000-0000-0000-0000000000b1', pg_temp.payload('pgtap-0133-b'), 'b1330000-0000-0000-0000-000000000002') $$),
  '^42501 actor_not_platform_staff', 'B: non-staff actor refused (42501)');
select matches(pg_temp.svc_err($$ select api.provision_tenant('b1330000-0000-0000-0000-0000000000b1', pg_temp.payload('pgtap-0133-b'), 'b1330000-0000-0000-0000-0000000000ff') $$),
  '^42501 actor_not_platform_staff', 'B: unknown actor refused (42501)');
select is(pg_temp.snapshot(), (select v from snap where label = 'before_b'), 'B: no rows written anywhere');

-- C: happy path ------------------------------------------------------------------------------
create temp table res (label text primary key, r jsonb);
insert into res select 'c', pg_temp.svc($$ select api.provision_tenant('b1330000-0000-0000-0000-0000000000c1', pg_temp.payload('pgtap-0133-c'), 'b1330000-0000-0000-0000-000000000001') $$);
create temp table c_ids as
  select (r ->> 'tenant_id')::uuid as tenant_id, (r ->> 'location_id')::uuid as location_id from res where label = 'c';

select is((select r ->> 'status' from res where label = 'c'), 'db_done', 'C: result status db_done');
select is((select (r ->> 'idempotent')::boolean from res where label = 'c'), false, 'C: first run is not idempotent replay');
select is((select slug::text || '/' || kind || '/' || status || '/' || name from core.tenants where id = (select tenant_id from c_ids)),
  'pgtap-0133-c/client/active/pgTAP Cafe pgtap-0133-c', 'C: tenant (client, active)');
select is((select count(*)::int from core.locations where tenant_id = (select tenant_id from c_ids)), 1, 'C: one location');
select is((select name || '/' || timezone from core.locations where id = (select location_id from c_ids)), '本店/Asia/Tokyo', 'C: location name + timezone');
select is((select plan_code || '/' || status from core.tenant_plans where tenant_id = (select tenant_id from c_ids)), 'trial/trial', 'C: plan trial, status trial');
select is((select trial_ends_at from core.tenant_plans where tenant_id = (select tenant_id from c_ids)), now() + interval '30 days', 'C: trial ends in 30 days');
select is((select package_code || '/' || package_version || '/' || status from core.tenant_packages where tenant_id = (select tenant_id from c_ids)),
  'cafe/3/active', 'C: cafe package v3 active');
select is((select string_agg(module::text, ',' order by module::text) from core.tenant_modules where tenant_id = (select tenant_id from c_ids) and is_enabled),
  'core,inventory,issues,operations,purchases,recipes,workforce', 'C: every cafe module enabled, incl. purchases and recipes');
select is((select required_headcount_by_weekday::text || '/' || max_monthly_hours || '/' || max_weekly_hours || '/' || max_days_per_week
                  || '/' || auto_create_day_of_month || '/' || auto_create_enabled
             from workforce.schedule_settings where tenant_id = (select tenant_id from c_ids) and location_id = (select location_id from c_ids)),
  '[1, 2, 2, 2, 2, 2, 1]/160/40/5/15/false', 'C: schedule settings from the payload, auto-create OFF');
select is((select string_agg(code || '=' || label_ja || ' ' || to_char(starts_at_local, 'HH24:MI') || '-' || to_char(ends_at_local, 'HH24:MI'), ', ' order by sort_order)
             from workforce.shift_types where tenant_id = (select tenant_id from c_ids)),
  'EARLY=早番 07:00-12:00, MID=中番 10:00-14:00, LATE=遅番 12:00-17:00', 'C: three shift types');
select is((select count(*)::int from operations.checklist_templates where tenant_id = (select tenant_id from c_ids) and location_id = (select location_id from c_ids)),
  2, 'C: two location-scoped checklist templates');
select is((select count(*)::int from operations.checklist_items where tenant_id = (select tenant_id from c_ids)), 4, 'C: four checklist items');
select is((select string_agg(coalesce(numeric_min::text, '-') || '..' || coalesce(numeric_max::text, '-'), ',' order by numeric_max nulls last)
             from operations.checklist_items where tenant_id = (select tenant_id from c_ids) and response_type = 'numeric'),
  '-..-15,0..5,65..-', 'C: numeric ranges as in the manifest (one-sided bounds stay NULL)');
select is((select count(*)::int from operations.task_schedules where tenant_id = (select tenant_id from c_ids) and recurrence_kind = 'daily' and is_active),
  2, 'C: one daily schedule per template');
select ok((select bool_and(effective_from >= current_date) from operations.task_schedules where tenant_id = (select tenant_id from c_ids)),
  'C: schedules are never backdated');
select is((select status || '/' || step || '/' || template_code || '/' || template_version || '/' || created_by
             from core.tenant_provisioning where request_id = 'b1330000-0000-0000-0000-0000000000c1'),
  'db_done/db/cafe/3/b1330000-0000-0000-0000-000000000001', 'C: status row db_done');
select is((select count(*)::int from audit.audit_logs where tenant_id = (select tenant_id from c_ids) and entity = 'tenant' and action = 'provision'),
  1, 'C: exactly one provision audit row');
select is((select actor_id::text || '/' || actor_kind || '/' || module from audit.audit_logs
            where tenant_id = (select tenant_id from c_ids) and action = 'provision'),
  'b1330000-0000-0000-0000-000000000001/user/core', 'C: audit actor = the platform-staff user');
select is((select (metadata -> 'counts')::text from audit.audit_logs where tenant_id = (select tenant_id from c_ids) and action = 'provision'),
  '{"locations": 1, "shift_types": 3, "operations_items": 4, "schedule_settings": 1, "operations_schedules": 2, "operations_templates": 2}',
  'C: audit counts');
select ok((select (after::text || metadata::text) !~ '(本店|pgTAP Cafe)' from audit.audit_logs
            where tenant_id = (select tenant_id from c_ids) and action = 'provision'),
  'C: the audit row carries no business / location names');
select is((select count(*)::int from core.tenant_memberships where tenant_id = (select tenant_id from c_ids)), 0,
  'C: no member yet (the owner invitation is 4B-2)');

-- D: idempotent re-run -------------------------------------------------------------------------
insert into snap values ('before_d', pg_temp.snapshot());
insert into res select 'd', pg_temp.svc($$ select api.provision_tenant('b1330000-0000-0000-0000-0000000000c1', pg_temp.payload('pgtap-0133-c'), 'b1330000-0000-0000-0000-000000000001') $$);
select is((select r ->> 'tenant_id' from res where label = 'd'), (select tenant_id::text from c_ids), 'D: same tenant returned');
select is((select (r ->> 'idempotent')::boolean from res where label = 'd'), true, 'D: flagged as idempotent replay');
select is(pg_temp.snapshot(), (select v from snap where label = 'before_d'), 'D: no new rows (incl. audit)');
select matches(pg_temp.svc_err($$ select api.provision_tenant('b1330000-0000-0000-0000-0000000000c1', pg_temp.payload('pgtap-0133-other'), 'b1330000-0000-0000-0000-000000000001') $$),
  'request_slug_mismatch', 'D: the same request_id with another slug is refused');

-- E: slug conflict -------------------------------------------------------------------------------
select matches(pg_temp.svc_err($$ select api.provision_tenant('b1330000-0000-0000-0000-0000000000e1', pg_temp.payload('pgtap-0133-c'), 'b1330000-0000-0000-0000-000000000001') $$),
  '^P0001 slug_taken', 'E: slug held by another request -> slug_taken');
insert into core.tenants (slug, name) values ('pgtap-0133-legacy', 'Legacy tenant');
insert into snap values ('before_e', pg_temp.snapshot());
select matches(pg_temp.svc_err($$ select api.provision_tenant('b1330000-0000-0000-0000-0000000000e2', pg_temp.payload('pgtap-0133-legacy'), 'b1330000-0000-0000-0000-000000000001') $$),
  '^P0001 slug_taken', 'E: slug of an existing (non-provisioned) tenant -> slug_taken');
select is(pg_temp.snapshot(), (select v from snap where label = 'before_e'), 'E: nothing written');

-- F: forced failure mid-way + validation refusals -------------------------------------------------
insert into snap values ('before_f', pg_temp.snapshot());
-- a boolean item with a numeric bound violates operations_checklist_items_numeric_only_chk,
-- AFTER tenant, location, plan, package, settings, shift types and the first template were inserted
select matches(pg_temp.svc_err(format($$ select api.provision_tenant('b1330000-0000-0000-0000-0000000000f1', %L::jsonb, 'b1330000-0000-0000-0000-000000000001') $$,
    jsonb_set(pg_temp.payload('pgtap-0133-f'), '{operations,templates,1,items,0}',
      '{"label": "bad", "response_type": "boolean", "is_critical": false, "is_required": true, "numeric_min": 1, "numeric_max": null, "numeric_unit": null}'::jsonb))),
  '^23514 ', 'F: a constraint violation in the last checklist aborts the call');
select is(pg_temp.snapshot(), (select v from snap where label = 'before_f'), 'F: everything rolled back (tenant, location, plan, package, modules, settings, shifts, checklists, status, audit)');
select is((select count(*)::int from core.tenants where slug = 'pgtap-0133-f'), 0, 'F: no half-created tenant');

select matches(pg_temp.svc_err(format($$ select api.provision_tenant('b1330000-0000-0000-0000-0000000000f2', %L::jsonb, 'b1330000-0000-0000-0000-000000000001') $$,
    jsonb_set(pg_temp.payload('pgtap-0133-f2'), '{location,timezone}', '"Mars/Olympus"'))),
  '^22023 invalid_payload: location.timezone', 'F: unknown timezone refused');
select matches(pg_temp.svc_err(format($$ select api.provision_tenant('b1330000-0000-0000-0000-0000000000f3', %L::jsonb, 'b1330000-0000-0000-0000-000000000001') $$,
    pg_temp.payload('pgtap-0133-f3') || '{"owner_email": "owner@example.com"}'::jsonb)),
  '^22023 invalid_payload: unknown key owner_email', 'F: plaintext PII keys are refused (whitelist)');
select matches(pg_temp.svc_err(format($$ select api.provision_tenant('b1330000-0000-0000-0000-0000000000f4', %L::jsonb, 'b1330000-0000-0000-0000-000000000001') $$,
    jsonb_set(pg_temp.payload('pgtap-0133-f4'), '{template_version}', '2'))),
  '^22023 invalid_payload: template_version', 'F: unknown template version refused');
select matches(pg_temp.svc_err(format($$ select api.provision_tenant('b1330000-0000-0000-0000-0000000000f5', %L::jsonb, 'b1330000-0000-0000-0000-000000000001') $$,
    pg_temp.payload('admin'))),
  '^22023 invalid_payload: slug reserved', 'F: reserved slug refused');
select matches(pg_temp.svc_err(format($$ select api.provision_tenant('b1330000-0000-0000-0000-0000000000f6', %L::jsonb, 'b1330000-0000-0000-0000-000000000001') $$,
    pg_temp.payload('Bad_Slug'))),
  '^22023 invalid_payload: slug format', 'F: malformed slug refused');
select matches(pg_temp.svc_err(format($$ select api.provision_tenant('b1330000-0000-0000-0000-0000000000f7', %L::jsonb, 'b1330000-0000-0000-0000-000000000001') $$,
    jsonb_set(pg_temp.payload('pgtap-0133-f7'), '{package_code}', '"no_such"'))),
  '^22023 invalid_payload: package_code', 'F: unknown package refused');
select matches(pg_temp.svc_err(format($$ select api.provision_tenant('b1330000-0000-0000-0000-0000000000f8', %L::jsonb, 'b1330000-0000-0000-0000-000000000001') $$,
    jsonb_set(pg_temp.payload('pgtap-0133-f8'), '{schedule_settings,auto_create_enabled}', 'true'))),
  '^22023 invalid_payload: auto_create_enabled', 'F: provisioning never switches auto-create on');
select matches(pg_temp.svc_err(format($$ select api.provision_tenant('b1330000-0000-0000-0000-0000000000f9', %L::jsonb, 'b1330000-0000-0000-0000-000000000001') $$,
    jsonb_set(pg_temp.payload('pgtap-0133-f9'), '{plan,code}', '"platinum"'))),
  '^22023 invalid_payload: plan.code', 'F: unknown plan refused');
select is(pg_temp.snapshot(), (select v from snap where label = 'before_f'), 'F: no refusal wrote anything');

-- G: failed_db record, then retry of the same request ---------------------------------------------
select is(pg_temp.svc($$ select api.mark_provisioning_failed('b1330000-0000-0000-0000-0000000000f1', 'pgtap-0133-f', 'check_violation', 'b1330000-0000-0000-0000-000000000001') $$) ->> 'status',
  'failed_db', 'G: failure recorded by the caller');
select is((select coalesce(tenant_id::text, 'null') || '/' || error_code from core.tenant_provisioning where request_id = 'b1330000-0000-0000-0000-0000000000f1'),
  'null/check_violation', 'G: failed row has no tenant and a machine error code');
select matches(pg_temp.svc_err($$ select api.mark_provisioning_failed('b1330000-0000-0000-0000-0000000000f1', 'pgtap-0133-f', 'Owner owner@example.com', 'b1330000-0000-0000-0000-000000000001') $$),
  '^22023 ', 'G: free text (possible PII) is not accepted as an error code');
select matches(pg_temp.svc_err($$ select api.mark_provisioning_failed('b1330000-0000-0000-0000-0000000000f1', 'pgtap-0133-f', 'x', 'b1330000-0000-0000-0000-000000000002') $$),
  '^42501 ', 'G: non-staff cannot mark failures');
select matches(pg_temp.svc_err($$ select api.provision_tenant('b1330000-0000-0000-0000-0000000000f9', pg_temp.payload('pgtap-0133-f'), 'b1330000-0000-0000-0000-000000000001') $$),
  'slug_taken', 'G: the failed request still holds its slug against other requests');
insert into res select 'g', pg_temp.svc($$ select api.provision_tenant('b1330000-0000-0000-0000-0000000000f1', pg_temp.payload('pgtap-0133-f'), 'b1330000-0000-0000-0000-000000000001') $$);
select is((select r ->> 'status' from res where label = 'g'), 'db_done', 'G: retry with a corrected payload succeeds');
select is((select count(*)::int from core.tenant_provisioning where slug = 'pgtap-0133-f'), 1, 'G: still one status row for the request');
select is((select (metadata ->> 'retry')::boolean from audit.audit_logs where tenant_id = (select (r ->> 'tenant_id')::uuid from res where label = 'g') and action = 'provision'),
  true, 'G: audit marks the retry');
select is(pg_temp.svc($$ select api.mark_provisioning_failed('b1330000-0000-0000-0000-0000000000c1', 'pgtap-0133-c', 'late_error', 'b1330000-0000-0000-0000-000000000001') $$) ->> 'status',
  'db_done', 'G: a provisioned request is never downgraded to failed_db');

-- H: rate limit -----------------------------------------------------------------------------------
insert into core.tenant_provisioning (request_id, slug, status, step, error_code, created_by)
select gen_random_uuid(), 'pgtap-0133-rl-' || g, 'failed_db', 'db', 'test', 'b1330000-0000-0000-0000-000000000003'
  from generate_series(1, 20) g;
insert into snap values ('before_h', pg_temp.snapshot());
select matches(pg_temp.svc_err($$ select api.provision_tenant('b1330000-0000-0000-0000-0000000000a9', pg_temp.payload('pgtap-0133-h'), 'b1330000-0000-0000-0000-000000000003') $$),
  '^P0001 rate_limited', 'H: the 21st request within an hour is refused');
select is(pg_temp.snapshot(), (select v from snap where label = 'before_h'), 'H: nothing written');
update core.tenant_provisioning set created_at = now() - interval '2 hours' where created_by = 'b1330000-0000-0000-0000-000000000003';
select is(pg_temp.svc($$ select api.provision_tenant('b1330000-0000-0000-0000-0000000000a9', pg_temp.payload('pgtap-0133-h'), 'b1330000-0000-0000-0000-000000000003') $$) ->> 'status',
  'db_done', 'H: allowed again once the hour has passed');

select * from finish();
rollback;
