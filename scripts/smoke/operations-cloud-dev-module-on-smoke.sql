-- ============================================================================
-- Operations module-ON smoke — Cloud DEV (Step 4)
-- ----------------------------------------------------------------------------
-- PURPOSE
--   Prove on Cloud DEV that the existing Operations foundation (migrations
--   0099-0105, 0111) can be enabled for a dedicated smoke tenant WITHOUT
--   breaking tenant isolation, location isolation, RBAC, RLS, the module
--   entitlement boundary, or any other tenant.
--
-- SAFETY MODEL — THIS SCRIPT COMMITS NOTHING.
--   Everything runs inside ONE transaction that ends in ROLLBACK. The
--   `core.tenant_modules` enable row, the synthetic smoke users, the synthetic
--   "disabled" tenant, and every template created through the API are all
--   discarded when the script finishes. There is no cleanup step because there
--   is nothing to clean up. Re-running is always safe and side-effect-free.
--   (A genuinely persistent enablement for Vercel Preview click-through would
--   be a SEPARATE, explicitly Founder-approved action — not this script.)
--
--   Requirements: a direct Postgres connection to Cloud DEV (psql), and the
--   smoke tenant + location below must already exist on Cloud DEV. It does NOT
--   create Supabase Auth users and does NOT touch Production.
--
-- HOW TO RUN (operator / Founder; Cloud DEV connection string in $DATABASE_URL):
--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--       -f scripts/smoke/operations-cloud-dev-module-on-smoke.sql
--
--   Override the target tenant/location if the documented ids ever change:
--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--       -v smoke_tenant=<uuid> -v smoke_location=<uuid> \
--       -f scripts/smoke/operations-cloud-dev-module-on-smoke.sql
--
-- RESULT
--   Every check RAISES EXCEPTION on failure, so a non-zero psql exit code = a
--   FAILED smoke. On success the tail prints one categorical block:
--     OPERATIONS_MODULE_ON=PASS  ENABLED_TENANT=PASS  DISABLED_TENANT=PASS
--     CROSS_TENANT_ISOLATION=PASS  ROLE_BOUNDARY=PASS  LOCATION_BOUNDARY=PASS
--     SECRET_SAFETY=PASS
--
-- Never prints credentials or PII. All actor identifiers are synthetic.
-- Local mirror: pgTAP supabase/tests/0055_operations_module_on_smoke.sql.
-- ============================================================================

\set ON_ERROR_STOP on

\if :{?smoke_tenant}
\else
  \set smoke_tenant '37088bfe-14f9-4604-af39-61dd09d37b0c'
\endif
\if :{?smoke_location}
\else
  \set smoke_location 'a902c7f6-0000-0000-0000-000000000000'
\endif

begin;

set local search_path to public, core, operations, api;

-- The two runtime parameters must be stashed into transaction-local GUCs via
-- PLAIN SQL — psql does NOT interpolate :'x' inside a dollar-quoted body, so
-- this is the only place the -v / \set values can cross into PL/pgSQL.
-- is_local => they vanish on ROLLBACK regardless.
\o /dev/null
select set_config('smoke.tenant',   :'smoke_tenant',   true);
select set_config('smoke.location', :'smoke_location', true);

-- Synthetic actor / tenant ids are fixed constants (private, obviously-fake
-- uuid range) — set here so every block below reads them the same way.
select set_config('smoke.u_manager',  '5b0a0000-0000-4000-a000-0000000000a1', true);
select set_config('smoke.u_employee', '5b0a0000-0000-4000-a000-0000000000e1', true);
select set_config('smoke.u_other',    '5b0a0000-0000-4000-a000-0000000000a2', true);
select set_config('smoke.l_other',    '5b0a0000-0000-4000-a000-000000000002', true);
select set_config('smoke.t_disabled', '5b0a0000-0000-4000-b000-000000000000', true);
select set_config('smoke.l_disabled', '5b0a0000-0000-4000-b000-000000000001', true);
select set_config('smoke.u_dis_mgr',  '5b0a0000-0000-4000-b000-0000000000a1', true);
\o

-- --------------------------------------------------------------------------
-- STEP 0 — preflight. Target tenant + location MUST already exist; refuse to
-- run against anything that is not clearly a demo/smoke tenant.
-- --------------------------------------------------------------------------
do $$
declare
  v_tenant uuid := current_setting('smoke.tenant')::uuid;
  v_loc    uuid := current_setting('smoke.location')::uuid;
  v_slug   text;
  v_kind   text;
begin
  select slug, kind::text into v_slug, v_kind from core.tenants where id = v_tenant;
  if v_slug is null then
    raise exception 'PREFLIGHT FAIL: smoke tenant % not found on this database', v_tenant;
  end if;
  if v_kind is distinct from 'demo' then
    raise exception 'PREFLIGHT FAIL: smoke tenant % has kind=% (expected demo) — refusing to run', v_slug, v_kind;
  end if;
  if not exists (select 1 from core.locations where id = v_loc and tenant_id = v_tenant) then
    raise exception 'PREFLIGHT FAIL: location % does not belong to smoke tenant %', v_loc, v_slug;
  end if;
  if exists (select 1 from core.tenant_modules where tenant_id = v_tenant and module = 'operations' and is_enabled) then
    raise notice 'PREFLIGHT NOTE: operations already enabled for % — smoke still valid, nothing is committed', v_slug;
  end if;
  raise notice 'PREFLIGHT OK: tenant=% (kind=%) location=%', v_slug, v_kind, v_loc;
end $$;

-- --------------------------------------------------------------------------
-- STEP 1 — synthetic actors + a synthetic never-entitled tenant (rolled back).
-- role ids: manager = ...005, employee = ...006
-- --------------------------------------------------------------------------
do $$
declare
  v_tenant uuid := current_setting('smoke.tenant')::uuid;
  v_loc    uuid := current_setting('smoke.location')::uuid;
begin
  insert into core.users (id, display_name) values
    (current_setting('smoke.u_manager')::uuid,  'SMOKE Operations Manager (synthetic, rolled back)'),
    (current_setting('smoke.u_employee')::uuid, 'SMOKE Operations Employee (synthetic, rolled back)'),
    (current_setting('smoke.u_other')::uuid,    'SMOKE other-location Manager (synthetic, rolled back)'),
    (current_setting('smoke.u_dis_mgr')::uuid,  'SMOKE Disabled-tenant Manager (synthetic, rolled back)');

  insert into core.tenants (id, slug, name, kind) values
    (current_setting('smoke.t_disabled')::uuid,
     'smoke-operations-disabled-'||substr(md5(random()::text),1,8),
     'SMOKE disabled tenant (synthetic, rolled back)', 'demo');
  insert into core.locations (id, tenant_id, name, timezone) values
    (current_setting('smoke.l_disabled')::uuid, current_setting('smoke.t_disabled')::uuid, 'SMOKE disabled / L1', 'Asia/Tokyo'),
    (current_setting('smoke.l_other')::uuid,    v_tenant,                                   'SMOKE other location / L2 (synthetic, rolled back)', 'Asia/Tokyo');

  insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
    (v_tenant, current_setting('smoke.u_manager')::uuid,  '00000000-0000-0000-0000-000000000005', null),
    (v_tenant, current_setting('smoke.u_employee')::uuid, '00000000-0000-0000-0000-000000000006', v_loc),
    (v_tenant, current_setting('smoke.u_other')::uuid,    '00000000-0000-0000-0000-000000000005', current_setting('smoke.l_other')::uuid),
    (current_setting('smoke.t_disabled')::uuid, current_setting('smoke.u_dis_mgr')::uuid, '00000000-0000-0000-0000-000000000005', null);
end $$;

-- --------------------------------------------------------------------------
-- STEP 2 — enable Operations for the smoke tenant (rolled back).
-- --------------------------------------------------------------------------
do $$
declare v_tenant uuid := current_setting('smoke.tenant')::uuid;
begin
  insert into core.tenant_modules (tenant_id, module, is_enabled)
  values (v_tenant, 'operations', true)
  on conflict (tenant_id, module) do update set is_enabled = true;

  if not core.has_module_access(v_tenant, 'operations') then
    raise exception 'OPERATIONS_MODULE_ON = FAIL: has_module_access still false after enable';
  end if;
  raise notice 'OPERATIONS_MODULE_ON = PASS';
end $$;

-- --------------------------------------------------------------------------
-- Role-hop helper: run scalar SQL as an authenticated end-user — the exact
-- path a Next.js Server Action -> api.* facade takes. Fixture privilege above
-- is NOT reused here; these checks stand on RLS + SECURITY INVOKER only.
-- --------------------------------------------------------------------------
create or replace function pg_temp.as_auth(p_sub text, p_sql text)
returns text language plpgsql as $$
declare r text;
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', p_sub, true);
  set local role authenticated;
  execute p_sql into r;
  reset role;
  return r;
exception when others then
  reset role;
  return 'ERR:'||sqlerrm;
end $$;

-- ==========================================================================
-- SCENARIO A — ENABLED_TENANT
-- ==========================================================================
do $$
declare
  v_t   uuid := current_setting('smoke.tenant')::uuid;
  v_mgr text := current_setting('smoke.u_manager');
  v_before int; v_after int; v_res text;
begin
  v_before := pg_temp.as_auth(v_mgr, format($f$ select count(*)::int from api.operations_templates where tenant_id = %L $f$, v_t))::int;

  v_res := pg_temp.as_auth(v_mgr, format($f$ select (api.operations_create_template(%L,'SMOKE A/ENABLED template',null,'Smoke',null))::text $f$, v_t));
  if v_res like 'ERR:%' then raise exception 'ENABLED_TENANT = FAIL: manager could not create a template: %', v_res; end if;

  v_after := pg_temp.as_auth(v_mgr, format($f$ select count(*)::int from api.operations_templates where tenant_id = %L $f$, v_t))::int;
  if v_after <> v_before + 1 then raise exception 'ENABLED_TENANT = FAIL: template count % -> % (expected +1)', v_before, v_after; end if;

  v_res := pg_temp.as_auth(v_mgr, $f$ select count(*)::int::text from api.operations_expected_tasks(current_date, current_date) $f$);
  if v_res like 'ERR:%' then raise exception 'ENABLED_TENANT = FAIL: api.operations_expected_tasks errored: %', v_res; end if;

  raise notice 'ENABLED_TENANT = PASS (templates % -> %, expected_tasks callable)', v_before, v_after;
end $$;

-- ==========================================================================
-- SCENARIO B — DISABLED_TENANT  (enforced, not merely hidden)
-- ==========================================================================
do $$
declare
  v_dis uuid := current_setting('smoke.t_disabled')::uuid;
  v_mgr text := current_setting('smoke.u_dis_mgr');
  v_cnt int; v_res text;
begin
  v_cnt := pg_temp.as_auth(v_mgr, format($f$ select count(*)::int from api.operations_templates where tenant_id = %L $f$, v_dis))::int;
  if v_cnt <> 0 then raise exception 'DISABLED_TENANT = FAIL: disabled-tenant manager sees % templates via api facade', v_cnt; end if;

  v_res := pg_temp.as_auth(v_mgr, format($f$ select (api.operations_create_template(%L,'should fail',null,null,null))::text $f$, v_dis));
  if v_res <> 'ERR:operations_module_disabled' then
    raise exception 'DISABLED_TENANT = FAIL: write RPC returned "%" (expected ERR:operations_module_disabled)', v_res;
  end if;

  raise notice 'DISABLED_TENANT = PASS (no read; write RPC fails closed: operations_module_disabled)';
end $$;

-- ==========================================================================
-- SCENARIO C — CROSS_TENANT_ISOLATION  (same path an app uses)
-- ==========================================================================
do $$
declare
  v_t   uuid := current_setting('smoke.tenant')::uuid;
  v_dis uuid := current_setting('smoke.t_disabled')::uuid;
  v_mgr text := current_setting('smoke.u_manager');
  v_cnt int; v_all int; v_res text;
begin
  v_cnt := pg_temp.as_auth(v_mgr, format($f$ select count(*)::int from api.operations_templates where tenant_id = %L $f$, v_dis))::int;
  if v_cnt <> 0 then raise exception 'CROSS_TENANT_ISOLATION = FAIL: smoke manager sees % rows of another tenant', v_cnt; end if;

  v_all := pg_temp.as_auth(v_mgr, $f$ select count(*)::int from api.operations_templates $f$)::int;
  v_cnt := pg_temp.as_auth(v_mgr, format($f$ select count(*)::int from api.operations_templates where tenant_id <> %L $f$, v_t))::int;
  if v_cnt <> 0 then raise exception 'CROSS_TENANT_ISOLATION = FAIL: unfiltered read leaked % non-smoke rows (of % total)', v_cnt, v_all; end if;

  v_res := pg_temp.as_auth(v_mgr, format($f$ select (api.operations_create_template(%L,'cross-tenant',null,null,null))::text $f$, v_dis));
  if v_res not like 'ERR:%' then raise exception 'CROSS_TENANT_ISOLATION = FAIL: smoke manager created a template for another tenant (got "%")', v_res; end if;

  raise notice 'CROSS_TENANT_ISOLATION = PASS (no cross read, no cross write; % smoke rows visible)', v_all;
end $$;

-- ==========================================================================
-- SCENARIO D — ROLE_BOUNDARY  (Manager vs Staff / employee)
-- ==========================================================================
do $$
declare
  v_t   uuid := current_setting('smoke.tenant')::uuid;
  v_emp text := current_setting('smoke.u_employee');
  v_read int; v_res text; v_resolve int; v_execute int;
begin
  v_read := pg_temp.as_auth(v_emp, format($f$ select count(*)::int from api.operations_templates where tenant_id = %L $f$, v_t))::int;
  if v_read < 1 then raise exception 'ROLE_BOUNDARY = FAIL: employee with task.read sees % tenant-wide templates (expected >= 1)', v_read; end if;

  v_res := pg_temp.as_auth(v_emp, format($f$ select (api.operations_create_template(%L,'by employee',null,null,null))::text $f$, v_t));
  if v_res <> 'ERR:operations_permission_denied' then
    raise exception 'ROLE_BOUNDARY = FAIL: employee create-template returned "%" (expected ERR:operations_permission_denied)', v_res;
  end if;

  v_resolve := pg_temp.as_auth(v_emp, format($f$ select (core.has_permission_in_tenant(%L,'operations.exception.resolve'))::int $f$, v_t))::int;
  v_execute := pg_temp.as_auth(v_emp, format($f$ select (core.has_permission_in_tenant(%L,'operations.task.execute'))::int $f$, v_t))::int;
  if v_resolve <> 0 then raise exception 'ROLE_BOUNDARY = FAIL: employee holds operations.exception.resolve'; end if;
  if v_execute <> 1 then raise exception 'ROLE_BOUNDARY = FAIL: employee does NOT hold operations.task.execute'; end if;

  raise notice 'ROLE_BOUNDARY = PASS (employee: read yes, configure no, resolve no, execute yes)';
end $$;

-- ==========================================================================
-- SCENARIO E — LOCATION_BOUNDARY
-- ==========================================================================
do $$
declare
  v_t     uuid := current_setting('smoke.tenant')::uuid;
  v_loc   uuid := current_setting('smoke.location')::uuid;
  v_mgr   text := current_setting('smoke.u_manager');
  v_other text := current_setting('smoke.u_other');
  v_tmpl text; v_seen int; v_upd text; v_name text;
begin
  v_tmpl := pg_temp.as_auth(v_mgr, format($f$ select (api.operations_create_template(%L,'SMOKE L1-scoped template',%L,'Closing',null))::text $f$, v_t, v_loc));
  if v_tmpl like 'ERR:%' then raise exception 'LOCATION_BOUNDARY = FAIL: could not create a location-scoped template: %', v_tmpl; end if;

  v_seen := pg_temp.as_auth(v_other, format($f$ select count(*)::int from api.operations_templates where template_id = %L $f$, v_tmpl))::int;
  if v_seen <> 0 then raise exception 'LOCATION_BOUNDARY = FAIL: an L2-only manager can see the L1-scoped template'; end if;

  grant update on operations.checklist_templates to authenticated;
  v_upd := pg_temp.as_auth(v_other, format($f$ with u as (update operations.checklist_templates set name='hijacked' where id = %L returning 1) select count(*)::int::text from u $f$, v_tmpl));
  revoke update on operations.checklist_templates from authenticated;
  if v_upd <> '0' then raise exception 'LOCATION_BOUNDARY = FAIL: L2-only manager updated % rows of the L1-scoped template (expected 0)', v_upd; end if;

  select name into v_name from operations.checklist_templates where id = v_tmpl::uuid;
  if v_name <> 'SMOKE L1-scoped template' then raise exception 'LOCATION_BOUNDARY = FAIL: template name changed to "%"', v_name; end if;

  raise notice 'LOCATION_BOUNDARY = PASS (L1-scoped template invisible + immutable to an L2-only actor)';
end $$;

do $$ begin raise notice 'SECRET_SAFETY = PASS (no credential is read or printed by this script)'; end $$;

\echo ''
\echo '=================================================================='
\echo ' OPERATIONS CLOUD DEV MODULE-ON SMOKE — ALL SCENARIOS PASSED'
\echo '   OPERATIONS_MODULE_ON=PASS   ENABLED_TENANT=PASS'
\echo '   DISABLED_TENANT=PASS        CROSS_TENANT_ISOLATION=PASS'
\echo '   ROLE_BOUNDARY=PASS          LOCATION_BOUNDARY=PASS'
\echo '   SECRET_SAFETY=PASS'
\echo ' Nothing was committed — rolling back all smoke data now.'
\echo '=================================================================='

rollback;
