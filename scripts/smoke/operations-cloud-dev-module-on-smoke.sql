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
--
--   TWO machine-verified gates run BEFORE any INSERT/UPDATE (STEP 0):
--     0a  CLOUD TARGET GUARD — proves the connected database is the expected
--         ORUWA Cloud DEV project (ref `pehcoenozjtsjdvjietj`) and is NOT the
--         known Production project (ref `jsgmmsdkuptdsxtcxhsv`). Supabase
--         exposes no project-ref signal to the pooler `postgres` role, so
--         this is proven by the LAYER-1 wrapper's client-side check of the
--         stored connection string (passed in as -v wrapper_verified_ref),
--         backed by any database-side signal that IS available (marker /
--         _realtime / pooler username), all subject to a Production tripwire.
--         Fails closed if the target cannot be proven, differs, or looks
--         like Production.
--     0b  SMOKE TENANT / LOCATION — resolves smoke-tenant-b from its stable
--         slug, cross-checks it against the historically-recorded UUID,
--         requires kind=demo and exactly one location. Fails closed on any
--         ambiguity. No manual Supabase Studio lookup is needed.
--
-- HOW TO RUN — see docs/operations/operations-cloud-dev-module-on-smoke-runbook.md
--   ONE command (the wrapper reads the stored Cloud DEV credential, fixes the
--   libpq-incompatible URI, verifies DEV/Production refs, and invokes psql):
--     pwsh -File scripts/smoke/operations-cloud-dev-module-on-smoke.ps1
--   The connection string / password are never read, echoed, or logged here.
--
-- LOCAL MIRROR RUN (validating the mechanism against local Supabase):
--     psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--       -v ON_ERROR_STOP=1 -q -v allow_local=1 \
--       -f scripts/smoke/operations-cloud-dev-module-on-smoke.sql
--   `allow_local=1` is honoured ONLY when the target proves to be local
--   Supabase (realtime tenant id `realtime-dev`); it can never let a
--   Production or unknown target through.
--
-- RESULT
--   Every check RAISES EXCEPTION on failure => non-zero psql exit = FAIL.
--   On success the tail prints one categorical block:
--     CLOUD_TARGET=PASS  OPERATIONS_MODULE_ON=PASS  ENABLED_TENANT=PASS
--     DISABLED_TENANT=PASS  CROSS_TENANT_ISOLATION=PASS  ROLE_BOUNDARY=PASS
--     LOCATION_BOUNDARY=PASS
--
-- Never prints credentials, connection strings, or PII. Project refs are
-- public identifiers (already in docs/project/master-state.md), not secrets.
-- pgTAP local mirror of the scenarios: supabase/tests/0055_operations_module_on_smoke.sql.
-- ============================================================================

\set ON_ERROR_STOP on

-- Public, non-secret identifiers (verbatim from docs/project/master-state.md).
\set expected_dev_ref  'pehcoenozjtsjdvjietj'
\set known_prod_ref    'jsgmmsdkuptdsxtcxhsv'

-- Stable smoke-tenant identity. Slug is primary; UUID is a cross-check anchor
-- (they MUST agree or the run fails closed). Override both together only for a
-- deliberate, different smoke tenant.
\if :{?smoke_tenant_slug}
\else
  \set smoke_tenant_slug 'smoke-tenant-b'
\endif
\if :{?smoke_tenant}
\else
  \set smoke_tenant '37088bfe-14f9-4604-af39-61dd09d37b0c'
\endif
-- Location is auto-resolved from the tenant's single location unless given.
\if :{?smoke_location}
\else
  \set smoke_location ''
\endif
\if :{?allow_local}
\else
  \set allow_local '0'
\endif
-- Set ONLY by the LAYER-1 wrapper (scripts/smoke/operations-cloud-dev-module-on-smoke.ps1),
-- which verifies the operator's stored Cloud DEV connection string client-side
-- (DEV ref present, Production ref absent, Session-pooler structure) — because
-- Supabase does not expose a project-ref signal to the pooler `postgres` role.
-- Still checked against the Production ref below. Empty on a bare psql run.
\if :{?wrapper_verified_ref}
\else
  \set wrapper_verified_ref ''
\endif

begin;

set local search_path to public, core, operations, api;

-- psql does NOT interpolate :'x' inside a dollar-quoted body — stash every
-- parameter into transaction-local GUCs (they vanish on ROLLBACK). One SELECT +
-- \gset => silent (no result rows echoed), portable to native Windows psql.
select
  set_config('smoke.expected_dev_ref',     :'expected_dev_ref',     true) as _p1,
  set_config('smoke.known_prod_ref',       :'known_prod_ref',       true) as _p2,
  set_config('smoke.allow_local',          :'allow_local',          true) as _p3,
  set_config('smoke.wrapper_verified_ref', :'wrapper_verified_ref', true) as _p4,
  set_config('smoke.tenant_slug',          :'smoke_tenant_slug',    true) as _p5,
  set_config('smoke.tenant',               :'smoke_tenant',         true) as _p6,
  set_config('smoke.location',             :'smoke_location',       true) as _p7,
  set_config('smoke.u_manager',  '5b0a0000-0000-4000-a000-0000000000a1', true) as _p8,
  set_config('smoke.u_employee', '5b0a0000-0000-4000-a000-0000000000e1', true) as _p9,
  set_config('smoke.u_other',    '5b0a0000-0000-4000-a000-0000000000a2', true) as _p10,
  set_config('smoke.l_other',    '5b0a0000-0000-4000-a000-000000000002', true) as _p11,
  set_config('smoke.t_disabled', '5b0a0000-0000-4000-b000-000000000000', true) as _p12,
  set_config('smoke.l_disabled', '5b0a0000-0000-4000-b000-000000000001', true) as _p13,
  set_config('smoke.u_dis_mgr',  '5b0a0000-0000-4000-b000-0000000000a1', true) as _p14,
  set_config('smoke.t_enabled2', '5b0a0000-0000-4000-c000-000000000000', true) as _p15,
  set_config('smoke.l_enabled2', '5b0a0000-0000-4000-c000-000000000001', true) as _p16,
  set_config('smoke.u_mgr2',     '5b0a0000-0000-4000-c000-0000000000a1', true) as _p17
\gset

-- ==========================================================================
-- STEP 0a — CLOUD TARGET GUARD  (runs BEFORE any mutation)
-- --------------------------------------------------------------------------
-- Supabase does NOT expose a project-ref signal to the Session-pooler
-- `postgres` role: `current_user` is plain `postgres` (Supavisor strips the
-- `.<ref>`), `_realtime.tenants` is not readable, and that role cannot
-- `ALTER DATABASE ... SET` a marker. So the target proof comes from TWO
-- layers, whichever is available:
--
--   LAYER 1 (primary, this connection)  — the repository wrapper
--     scripts/smoke/operations-cloud-dev-module-on-smoke.ps1 verifies the
--     operator's stored connection string CLIENT-SIDE (DEV ref present,
--     Production ref absent, Session-pooler structure) and passes the
--     verified ref in as `-v wrapper_verified_ref=<ref>`. It is re-checked
--     against the Production ref here.
--   LAYER 2 (used when present)         — database-side signals:
--     * `oruwa.cloud_target_ref` marker (if an admin set one)
--     * pooler username `postgres.<ref>` (if the pooler ever carries it)
--     * `_realtime.tenants.external_id` (if readable) — only external_id is
--       read, never jwt_secret
--     Any of these that name the Production ref TRIPS the guard.
--
-- No bare human "trust me" flag: `wrapper_verified_ref` is the wrapper's
-- channel, the wrapper is a reviewed repo artifact, and every mutation still
-- ROLLBACKs. Decision (FAIL CLOSED):
--   * known Production ref on ANY signal / on wrapper_verified_ref  -> FAIL
--   * marker present and <> expected                                -> FAIL
--   * pooler username present and <> expected                       -> FAIL
--   * wrapper_verified_ref present and <> expected                  -> FAIL
--   * marker = expected                                             -> PASS
--   * expected confirmed by pooler / _realtime                      -> PASS
--   * wrapper_verified_ref = expected                               -> PASS (LAYER 1)
--   * local sentinel + allow_local=1                                -> PASS (local mirror)
--   * nothing provable                                              -> FAIL
-- ==========================================================================
do $$
declare
  v_expected text := current_setting('smoke.expected_dev_ref');
  v_prod     text := current_setting('smoke.known_prod_ref');
  v_allow_local boolean := current_setting('smoke.allow_local') = '1';
  v_wrapper text := nullif(btrim(current_setting('smoke.wrapper_verified_ref')), '');
  v_marker text; v_user text; v_rt text;
  v_rtarr text[] := '{}';   -- _realtime external_id values
  v_is_local boolean := false;
  r text;
begin
  -- LAYER 2 signal: marker
  begin
    v_marker := nullif(btrim(current_setting('oruwa.cloud_target_ref', true)), '');
  exception when others then v_marker := null;
  end;

  -- LAYER 2 signal: pooler username
  if current_user ~ '^postgres\.[a-z0-9]{16,32}$' then
    v_user := split_part(current_user, '.', 2);
  end if;

  -- LAYER 2 signal: _realtime.tenants.external_id (defensive; only external_id)
  begin
    execute 'select string_agg(distinct external_id, '','') from _realtime.tenants' into v_rt;
  exception when others then v_rt := null;
  end;
  v_rtarr := array(select btrim(x) from unnest(coalesce(string_to_array(v_rt, ','), '{}')) x where btrim(x) <> '');
  if 'realtime-dev' = any (v_rtarr) then v_is_local := true; end if;

  -- (1) PRODUCTION tripwire — every signal, incl. the wrapper attestation.
  if v_prod in (v_marker, v_user, v_wrapper) or v_prod = any (v_rtarr) then
    raise exception 'CLOUD_TARGET = FAIL: a signal names the known PRODUCTION project ref — refusing to mutate. (wrapper=%, marker=%, user=%, realtime=%)',
      coalesce(v_wrapper,'-'), coalesce(v_marker,'-'), coalesce(v_user,'-'), coalesce(v_rt,'-');
  end if;

  -- (1b) contradiction — local sentinel alongside a foreign project ref.
  if v_is_local then
    foreach r in array v_rtarr loop
      if r <> 'realtime-dev' and r <> v_expected then
        raise exception 'CLOUD_TARGET = FAIL: _realtime.tenants holds both the local sentinel and a foreign project ref "%" — cannot classify the target.', r;
      end if;
    end loop;
  end if;

  -- (2) mismatched signals — any signal that names a non-DEV ref aborts.
  if v_marker is not null and v_marker <> v_expected then
    raise exception 'CLOUD_TARGET = FAIL: marker oruwa.cloud_target_ref = "%" is not the expected Cloud DEV ref "%".', v_marker, v_expected;
  end if;
  if v_user is not null and v_user <> v_expected then
    raise exception 'CLOUD_TARGET = FAIL: pooler username names project ref "%" which is not the expected Cloud DEV ref "%".', v_user, v_expected;
  end if;
  if v_wrapper is not null and v_wrapper <> v_expected then
    raise exception 'CLOUD_TARGET = FAIL: wrapper_verified_ref = "%" is not the expected Cloud DEV ref "%".', v_wrapper, v_expected;
  end if;

  -- (3) decide (fail closed)
  if v_marker = v_expected then
    raise notice 'CLOUD_TARGET = PASS (database-side marker oruwa.cloud_target_ref = %)', v_expected;
  elsif v_user = v_expected or v_expected = any (v_rtarr) then
    raise notice 'CLOUD_TARGET = PASS (expected Cloud DEV ref % confirmed database-side)', v_expected;
  elsif v_wrapper = v_expected then
    raise notice 'CLOUD_TARGET = PASS (LAYER 1: connection string verified Cloud DEV % by the repo wrapper; Supabase exposes no DB-side project-ref signal to this pooler role)', v_expected;
  elsif v_is_local and v_allow_local then
    raise notice 'CLOUD_TARGET = PASS (local Supabase, allow_local=1) — LOCAL MIRROR run, not Cloud DEV';
  elsif v_is_local then
    raise exception 'CLOUD_TARGET = FAIL: this is local Supabase. Pass -v allow_local=1 for the local mirror.';
  else
    raise exception 'CLOUD_TARGET = FAIL: cannot prove the target project — refusing to mutate. Run the wrapper  .\scripts\smoke\operations-cloud-dev-module-on-smoke.ps1  (it verifies the stored connection string and passes -v wrapper_verified_ref), or connect as a role that can SELECT _realtime.tenants, or have an admin set  oruwa.cloud_target_ref  on Cloud DEV.';
  end if;
end $$;

-- ==========================================================================
-- STEP 0b — SMOKE TENANT + LOCATION  (resolve + verify; no manual lookup)
-- --------------------------------------------------------------------------
--   * resolve by the stable slug (default 'smoke-tenant-b')
--   * exactly one such tenant, kind=demo
--   * its id MUST equal the historically-recorded UUID anchor (or the one
--     passed with -v smoke_tenant) — disagreement fails closed
--   * exactly one location (or -v smoke_location=<uuid> belonging to it)
-- ==========================================================================
do $$
declare
  v_slug     text := current_setting('smoke.tenant_slug');
  v_anchor   uuid := current_setting('smoke.tenant')::uuid;
  v_loc_raw  text := current_setting('smoke.location');
  v_n        int;
  v_id       uuid;
  v_kind     text;
  v_loc      uuid;
  v_nloc     int;
begin
  select count(*) into v_n from core.tenants where slug = v_slug;
  if v_n = 0 then
    raise exception 'TENANT_RESOLVE = FAIL: no tenant with slug "%" on this database', v_slug;
  end if;
  if v_n > 1 then
    raise exception 'TENANT_RESOLVE = FAIL: % tenants share slug "%" (slug must be unique) — refusing to guess', v_n, v_slug;
  end if;

  select id, kind::text into v_id, v_kind from core.tenants where slug = v_slug;
  if v_kind is distinct from 'demo' then
    raise exception 'TENANT_RESOLVE = FAIL: tenant "%" has kind=% (expected demo) — refusing to run', v_slug, v_kind;
  end if;
  if v_id <> v_anchor then
    raise exception 'TENANT_RESOLVE = FAIL: slug "%" resolves to % but the recorded UUID anchor is % — they must agree (pass -v smoke_tenant / -v smoke_tenant_slug together for a deliberate different tenant)', v_slug, v_id, v_anchor;
  end if;

  if v_loc_raw is null or v_loc_raw = '' then
    select count(*) into v_nloc from core.locations where tenant_id = v_id;
    if v_nloc <> 1 then
      raise exception 'LOCATION_RESOLVE = FAIL: tenant "%" has % locations (expected exactly 1) — pass -v smoke_location=<uuid>', v_slug, v_nloc;
    end if;
    select id into v_loc from core.locations where tenant_id = v_id;
  else
    v_loc := v_loc_raw::uuid;
    if not exists (select 1 from core.locations where id = v_loc and tenant_id = v_id) then
      raise exception 'LOCATION_RESOLVE = FAIL: location % does not belong to tenant "%"', v_loc, v_slug;
    end if;
  end if;

  -- publish the verified ids for the scenario blocks
  perform set_config('smoke.tenant',   v_id::uuid::text,  true);
  perform set_config('smoke.location', v_loc::uuid::text, true);

  if exists (select 1 from core.tenant_modules where tenant_id = v_id and module = 'operations' and is_enabled) then
    raise notice 'PREFLIGHT NOTE: operations already enabled for "%" — smoke still valid, nothing is committed', v_slug;
  end if;
  raise notice 'PREFLIGHT OK: tenant="%" id=% (kind=demo) location=%', v_slug, v_id, v_loc;
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
    (current_setting('smoke.u_dis_mgr')::uuid,  'SMOKE Disabled-tenant Manager (synthetic, rolled back)'),
    (current_setting('smoke.u_mgr2')::uuid,     'SMOKE second-enabled-tenant Manager (synthetic, rolled back)');

  insert into core.tenants (id, slug, name, kind) values
    (current_setting('smoke.t_disabled')::uuid,
     'smoke-operations-disabled-'||substr(md5(random()::text),1,8),
     'SMOKE disabled tenant (synthetic, rolled back)', 'demo'),
    (current_setting('smoke.t_enabled2')::uuid,
     'smoke-operations-enabled2-'||substr(md5(random()::text),1,8),
     'SMOKE second enabled tenant (synthetic, rolled back)', 'demo');
  insert into core.locations (id, tenant_id, name, timezone) values
    (current_setting('smoke.l_disabled')::uuid, current_setting('smoke.t_disabled')::uuid, 'SMOKE disabled / L1', 'Asia/Tokyo'),
    (current_setting('smoke.l_enabled2')::uuid, current_setting('smoke.t_enabled2')::uuid, 'SMOKE enabled2 / L1', 'Asia/Tokyo'),
    (current_setting('smoke.l_other')::uuid,    v_tenant,                                  'SMOKE other location / L2 (synthetic, rolled back)', 'Asia/Tokyo');

  insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
    (v_tenant, current_setting('smoke.u_manager')::uuid,  '00000000-0000-0000-0000-000000000005', null),
    (v_tenant, current_setting('smoke.u_employee')::uuid, '00000000-0000-0000-0000-000000000006', v_loc),
    (v_tenant, current_setting('smoke.u_other')::uuid,    '00000000-0000-0000-0000-000000000005', current_setting('smoke.l_other')::uuid),
    (current_setting('smoke.t_disabled')::uuid, current_setting('smoke.u_dis_mgr')::uuid, '00000000-0000-0000-0000-000000000005', null),
    (current_setting('smoke.t_enabled2')::uuid, current_setting('smoke.u_mgr2')::uuid,    '00000000-0000-0000-0000-000000000005', null);

  -- The synthetic "disabled" tenant carries an EXPLICIT is_enabled = false row
  -- (not a missing row) so Scenario B exercises the real ON->OFF toggle path,
  -- the one the runbook's persistent enable/disable snippet relies on. (The
  -- missing-row fail-closed branch is covered by the local pgTAP, tenant NIL.)
  insert into core.tenant_modules (tenant_id, module, is_enabled) values
    (current_setting('smoke.t_disabled')::uuid, 'operations', false),
    -- t_enabled2: Operations ON, but the smoke Manager has NO role in it — used
    -- by Scenario C to prove cross-tenant write denial by PERMISSION/RLS, past
    -- the module gate (which the disabled tenant would trip first).
    (current_setting('smoke.t_enabled2')::uuid, 'operations', true);

  -- Seed a real template into BOTH the disabled and the second-enabled tenant
  -- (superuser fixture insert, bypasses RLS). Without these, Scenario B/C's
  -- "sees 0 rows" assertions would pass vacuously (nothing to see) instead of
  -- proving the module gate / tenant isolation actually hides real data.
  insert into operations.checklist_templates (tenant_id, location_id, name, category) values
    (current_setting('smoke.t_disabled')::uuid, null, 'SMOKE disabled-tenant legacy template', 'Opening'),
    (current_setting('smoke.t_enabled2')::uuid, null, 'SMOKE tenant-E template',               'Opening');
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

-- Same, but a path that is EXPECTED to succeed: turn an unexpected error into a
-- named "<label> = FAIL (...)" diagnostic instead of an opaque ::int cast error.
create or replace function pg_temp.as_auth_ok(p_sub text, p_sql text, p_label text)
returns text language plpgsql as $$
declare r text := pg_temp.as_auth(p_sub, p_sql);
begin
  if r like 'ERR:%' then
    raise exception '% = FAIL (unexpected error on a path that must succeed): %', p_label, r;
  end if;
  return r;
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
  v_before := pg_temp.as_auth_ok(v_mgr,
    format($f$ select count(*)::int from api.operations_templates where tenant_id = %L $f$, v_t),
    'ENABLED_TENANT')::int;

  v_res := pg_temp.as_auth(v_mgr, format($f$ select (api.operations_create_template(%L,'SMOKE A/ENABLED template',null,'Smoke',null))::text $f$, v_t));
  if v_res like 'ERR:%' then raise exception 'ENABLED_TENANT = FAIL: manager could not create a template: %', v_res; end if;

  v_after := pg_temp.as_auth_ok(v_mgr,
    format($f$ select count(*)::int from api.operations_templates where tenant_id = %L $f$, v_t),
    'ENABLED_TENANT')::int;
  if v_after <> v_before + 1 then raise exception 'ENABLED_TENANT = FAIL: template count % -> % (expected +1)', v_before, v_after; end if;

  perform pg_temp.as_auth_ok(v_mgr,
    $f$ select count(*)::int::text from api.operations_expected_tasks(current_date, current_date) $f$,
    'ENABLED_TENANT');

  raise notice 'ENABLED_TENANT = PASS (templates % -> %, expected_tasks callable)', v_before, v_after;
end $$;

-- ==========================================================================
-- SCENARIO B — DISABLED_TENANT  (enforced, not merely hidden)
--   The disabled tenant's Manager genuinely holds the manager role there, so
--   the ONLY thing standing between him and the data is the module gate — that
--   is exactly what must fail closed here. Read is checked through both the
--   api.* facade AND the base table (RLS, not just the view).
-- ==========================================================================
do $$
declare
  v_dis uuid := current_setting('smoke.t_disabled')::uuid;
  v_mgr text := current_setting('smoke.u_dis_mgr');
  v_cnt int; v_res text;
begin
  v_cnt := pg_temp.as_auth_ok(v_mgr, format($f$ select count(*)::int from api.operations_templates where tenant_id = %L $f$, v_dis), 'DISABLED_TENANT')::int;
  if v_cnt <> 0 then raise exception 'DISABLED_TENANT = FAIL: disabled-tenant manager sees % templates via api facade', v_cnt; end if;

  v_cnt := pg_temp.as_auth_ok(v_mgr, format($f$ select count(*)::int from operations.checklist_templates where tenant_id = %L $f$, v_dis), 'DISABLED_TENANT')::int;
  if v_cnt <> 0 then raise exception 'DISABLED_TENANT = FAIL: disabled-tenant manager sees % templates via the base table (RLS)', v_cnt; end if;

  v_res := pg_temp.as_auth(v_mgr, format($f$ select (api.operations_create_template(%L,'should fail',null,null,null))::text $f$, v_dis));
  if v_res <> 'ERR:operations_module_disabled' then
    raise exception 'DISABLED_TENANT = FAIL: write RPC returned "%" (expected ERR:operations_module_disabled)', v_res;
  end if;

  raise notice 'DISABLED_TENANT = PASS (explicit is_enabled=false: no facade read, no base-table read, write RPC fails closed)';
end $$;

-- ==========================================================================
-- SCENARIO C — CROSS_TENANT_ISOLATION  (same path an app uses)
--   Cross-tenant WRITE is proven against t_enabled2 (Operations ON, but the
--   smoke Manager has no role there) so the denial comes from PERMISSION/RLS,
--   past the module gate — not from the module gate a disabled tenant trips
--   first. A raw INSERT is the RLS WITH CHECK backstop.
-- ==========================================================================
do $$
declare
  v_t    uuid := current_setting('smoke.tenant')::uuid;
  v_dis  uuid := current_setting('smoke.t_disabled')::uuid;
  v_en2  uuid := current_setting('smoke.t_enabled2')::uuid;
  v_mgr  text := current_setting('smoke.u_manager');
  v_cnt int; v_all int; v_res text;
begin
  -- no cross-tenant READ (both an unrelated OFF tenant and an unrelated ON tenant)
  v_cnt := pg_temp.as_auth_ok(v_mgr, format($f$ select count(*)::int from api.operations_templates where tenant_id in (%L,%L) $f$, v_dis, v_en2), 'CROSS_TENANT_ISOLATION')::int;
  if v_cnt <> 0 then raise exception 'CROSS_TENANT_ISOLATION = FAIL: smoke manager sees % rows of another tenant', v_cnt; end if;

  v_all := pg_temp.as_auth_ok(v_mgr, $f$ select count(*)::int from api.operations_templates $f$, 'CROSS_TENANT_ISOLATION')::int;
  v_cnt := pg_temp.as_auth_ok(v_mgr, format($f$ select count(*)::int from api.operations_templates where tenant_id <> %L $f$, v_t), 'CROSS_TENANT_ISOLATION')::int;
  if v_cnt <> 0 then raise exception 'CROSS_TENANT_ISOLATION = FAIL: unfiltered read leaked % non-smoke rows (of % total)', v_cnt, v_all; end if;

  -- cross-tenant WRITE via the sanctioned RPC, into an Operations-ON tenant:
  -- must be denied by permission (not by the module gate).
  v_res := pg_temp.as_auth(v_mgr, format($f$ select (api.operations_create_template(%L,'cross-tenant',null,null,null))::text $f$, v_en2));
  if v_res <> 'ERR:operations_permission_denied' then
    raise exception 'CROSS_TENANT_ISOLATION = FAIL: cross-tenant create into an ON tenant returned "%" (expected ERR:operations_permission_denied)', v_res;
  end if;

  -- raw INSERT backstop — must be rejected SPECIFICALLY by the RLS WITH CHECK
  -- policy (not by a missing grant / trigger / constraint, which would make
  -- this a false-positive). `returning` lets as_auth distinguish success
  -- (=> FAIL) from an exception (=> ERR:<message>).
  v_res := pg_temp.as_auth(v_mgr, format($f$ insert into operations.checklist_templates (tenant_id, location_id, name) values (%L, null, 'raw cross-tenant') returning tenant_id::text $f$, v_en2));
  if v_res not like 'ERR:%row-level security%' then
    raise exception 'CROSS_TENANT_ISOLATION = FAIL: raw cross-tenant INSERT was not rejected by RLS WITH CHECK (got "%")', v_res;
  end if;

  raise notice 'CROSS_TENANT_ISOLATION = PASS (no cross read; cross write denied by permission + RLS; % smoke rows visible)', v_all;
end $$;

-- ==========================================================================
-- SCENARIO D — ROLE_BOUNDARY  (Manager vs Staff / employee)
-- ==========================================================================
do $$
declare
  v_t   uuid := current_setting('smoke.tenant')::uuid;
  v_emp text := current_setting('smoke.u_employee');
  v_res text; v_read int; v_resolve int; v_execute int;
begin
  -- Staff CAN read: the tenant-wide template Scenario A created must be visible
  -- to the smoke-location employee (operations.task.read via RLS).
  v_read := pg_temp.as_auth_ok(v_emp,
    format($f$ select count(*)::int from api.operations_templates where tenant_id = %L $f$, v_t),
    'ROLE_BOUNDARY')::int;
  if v_read < 1 then
    raise exception 'ROLE_BOUNDARY = FAIL: employee (operations.task.read) sees % templates (expected >= 1)', v_read;
  end if;

  v_res := pg_temp.as_auth(v_emp, format($f$ select (api.operations_create_template(%L,'by employee',null,null,null))::text $f$, v_t));
  if v_res <> 'ERR:operations_permission_denied' then
    raise exception 'ROLE_BOUNDARY = FAIL: employee create-template returned "%" (expected ERR:operations_permission_denied)', v_res;
  end if;

  v_resolve := pg_temp.as_auth_ok(v_emp, format($f$ select (core.has_permission_in_tenant(%L,'operations.exception.resolve'))::int $f$, v_t), 'ROLE_BOUNDARY')::int;
  v_execute := pg_temp.as_auth_ok(v_emp, format($f$ select (core.has_permission_in_tenant(%L,'operations.task.execute'))::int $f$, v_t), 'ROLE_BOUNDARY')::int;
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
  v_tmpl := pg_temp.as_auth_ok(v_mgr,
    format($f$ select (api.operations_create_template(%L,'SMOKE L1-scoped template',%L,'Closing',null))::text $f$, v_t, v_loc),
    'LOCATION_BOUNDARY');

  v_seen := pg_temp.as_auth_ok(v_other, format($f$ select count(*)::int from api.operations_templates where template_id = %L $f$, v_tmpl), 'LOCATION_BOUNDARY')::int;
  if v_seen <> 0 then raise exception 'LOCATION_BOUNDARY = FAIL: an L2-only manager can see the L1-scoped template'; end if;

  -- UPDATE on operations.checklist_templates is already granted to `authenticated`
  -- by migration 0105; RLS is the boundary under test here.
  v_upd := pg_temp.as_auth_ok(v_other, format($f$ with u as (update operations.checklist_templates set name='hijacked' where id = %L returning 1) select count(*)::int::text from u $f$, v_tmpl), 'LOCATION_BOUNDARY');
  if v_upd <> '0' then raise exception 'LOCATION_BOUNDARY = FAIL: L2-only manager updated % rows of the L1-scoped template (expected 0)', v_upd; end if;

  select name into v_name from operations.checklist_templates where id = v_tmpl::uuid;
  if v_name <> 'SMOKE L1-scoped template' then raise exception 'LOCATION_BOUNDARY = FAIL: template name changed to "%"', v_name; end if;

  raise notice 'LOCATION_BOUNDARY = PASS (L1-scoped template invisible + immutable to an L2-only actor)';
end $$;

-- Secret safety is a property of this script BY CONSTRUCTION, not a runtime
-- check: it never reads a key/secret/PII column (the only _realtime read
-- selects `external_id` alone) and never echoes the connection string. It is
-- deliberately NOT reported as a "scenario" — an unconditional PASS notice
-- would be a vacuous assertion.

\echo ''
\echo '=================================================================='
\echo ' OPERATIONS CLOUD DEV MODULE-ON SMOKE — ALL SCENARIOS PASSED'
\echo '   CLOUD_TARGET=PASS           OPERATIONS_MODULE_ON=PASS'
\echo '   ENABLED_TENANT=PASS         DISABLED_TENANT=PASS'
\echo '   CROSS_TENANT_ISOLATION=PASS ROLE_BOUNDARY=PASS'
\echo '   LOCATION_BOUNDARY=PASS'
\echo ' Nothing was committed — rolling back all smoke data now.'
\echo '=================================================================='

rollback;
