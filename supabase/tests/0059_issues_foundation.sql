-- ============================================================================
-- DB test: Issues & Handover — domain foundation
--          (migrations 0117_core_module_code_add_issues.sql,
--           0118_issues_foundation.sql — Cafe v2.2 WP2, Slice A)
-- ----------------------------------------------------------------------------
-- Run with:  pnpm exec supabase db reset && pnpm exec supabase test db
--
-- Mission scenarios A-I (J skipped, not a sweep-based writer):
--   A  module-OFF blocks all access (has_module_access false -> RLS denies)
--   B  Staff with issues.report can create an issue and a handover at their
--      own location
--   C  Staff cannot create at a location they don't belong to
--   D  Staff cannot set reported_by_role='manager' when acting as staff
--      (actor-role coherence enforced server-side, not trusted from input)
--   E  Manager can read/resolve at their managed location(s)
--   F  Cross-tenant isolation
--   G  Guard trigger: UPDATE on an immutable field fails
--   H  Status transition coherence: resolved_at only set when
--      status='resolved', acknowledge/resolve stamp the right actor/timestamp
--   I  api.issues_open excludes resolved rows; api.issues includes everything
--      visible per RLS
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, audit, workforce, inventory, purchases, operations, issues, ai;

select no_plan();

-- --- Fixtures ---------------------------------------------------------------
insert into core.tenants (id, slug, name) values
  ('0f110000-0000-0000-0000-000000000000', 'pgtap-issues-m', 'pgTAP Issues M'),
  ('10110000-0000-0000-0000-000000000000', 'pgtap-issues-n', 'pgTAP Issues N');

insert into core.tenant_modules (tenant_id, module, is_enabled) values
  ('0f110000-0000-0000-0000-000000000000', 'issues', true),
  ('10110000-0000-0000-0000-000000000000', 'issues', true);

insert into core.locations (id, tenant_id, name, timezone) values
  ('0f100000-0000-0000-0000-000000000001', '0f110000-0000-0000-0000-000000000000', 'M / L1', 'Asia/Tokyo'),
  ('0f100000-0000-0000-0000-000000000002', '0f110000-0000-0000-0000-000000000000', 'M / L2', 'Asia/Tokyo'),
  ('10100000-0000-0000-0000-000000000001', '10110000-0000-0000-0000-000000000000', 'N / L1', 'Asia/Tokyo');

insert into core.users (id, display_name) values
  ('0f900000-0000-0000-0000-00000000000a', 'M Manager tenant-wide'),
  ('0f900000-0000-0000-0000-00000000000c', 'M Employee L1'),
  ('0f900000-0000-0000-0000-00000000000d', 'M Employee L2 (not L1)'),
  ('0fff0000-0000-0000-0000-0000000000ff', 'Non-member outsider'),
  ('10900000-0000-0000-0000-00000000000a', 'N Manager tenant-wide'),
  ('10900000-0000-0000-0000-00000000000c', 'N Employee L1');

-- manager role = ...005 ; employee role = ...006 (same well-known role ids as
-- 0058/0047 fixtures).
insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('0f110000-0000-0000-0000-000000000000', '0f900000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000005', null),
  ('0f110000-0000-0000-0000-000000000000', '0f900000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000006', '0f100000-0000-0000-0000-000000000001'),
  ('0f110000-0000-0000-0000-000000000000', '0f900000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-000000000006', '0f100000-0000-0000-0000-000000000002'),
  ('10110000-0000-0000-0000-000000000000', '10900000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000005', null),
  ('10110000-0000-0000-0000-000000000000', '10900000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000006', '10100000-0000-0000-0000-000000000001');

-- --- Role-hop helpers (same shape as 0058) ----------------------------------
create function pg_temp.as_auth_count(p_sub text, p_sql text)
returns int language plpgsql as $$
declare n int;
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('app.current_user_id', '', true);
  perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  set local role authenticated;
  execute p_sql into n;
  reset role;
  return n;
end;
$$;

create function pg_temp.as_auth_id(p_sub text, p_sql text)
returns uuid language plpgsql as $$
declare v uuid;
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('app.current_user_id', '', true);
  perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  set local role authenticated;
  execute p_sql into v;
  reset role;
  return v;
end;
$$;

create function pg_temp.as_auth_do(p_sub text, p_sql text)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('app.current_user_id', '', true);
  perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  set local role authenticated;
  execute p_sql;
  reset role;
end;
$$;

create function pg_temp.as_auth_throws(p_sub text, p_sql text)
returns boolean language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('app.current_user_id', '', true);
  perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  set local role authenticated;
  execute p_sql;
  reset role;
  return false;
exception when others then
  reset role;
  return true;
end;
$$;

create function pg_temp.as_role_throws(p_role text, p_sql text)
returns boolean language plpgsql as $$
begin
  execute format('set local role %I', p_role);
  execute p_sql;
  reset role;
  return false;
exception when others then
  reset role;
  return true;
end;
$$;

-- ============================================================================
-- A — module-OFF blocks all access
-- ============================================================================
-- Seed one row directly (bypassing RLS as postgres, module still ON at this
-- point) so the module-OFF read check below is non-trivial.
select lives_ok(
  $$ insert into issues.issues (tenant_id, location_id, kind, note, reported_by, reported_by_role)
     values ('10110000-0000-0000-0000-000000000000', '10100000-0000-0000-0000-000000000001', 'issue',
             'pre-existing row for the module-OFF check', '10900000-0000-0000-0000-00000000000a', 'manager') $$,
  'A setup: seed one row in tenant N while the module is still ON');

update core.tenant_modules set is_enabled = false where tenant_id = '10110000-0000-0000-0000-000000000000';

select ok(
  pg_temp.as_auth_throws('10900000-0000-0000-0000-00000000000a',
    $$ select api.issues_create('10110000-0000-0000-0000-000000000000',
         '10100000-0000-0000-0000-000000000001', 'issue', 'fridge is loud') $$),
  'A: api.issues_create raises when the issues module is OFF for the tenant');

select is(
  pg_temp.as_auth_count('10900000-0000-0000-0000-00000000000a',
    $$ select count(*)::int from issues.issues where tenant_id = '10110000-0000-0000-0000-000000000000' $$),
  0, 'A: RLS hides the pre-existing row once the module is OFF (has_module_access false -> RLS denies)');

update core.tenant_modules set is_enabled = true where tenant_id = '10110000-0000-0000-0000-000000000000';

select cmp_ok(
  pg_temp.as_auth_count('10900000-0000-0000-0000-00000000000a',
    $$ select count(*)::int from issues.issues where tenant_id = '10110000-0000-0000-0000-000000000000' $$),
  '>=', 1, 'A: the same row is visible again once the module is back ON');

-- ============================================================================
-- B — Staff with issues.report can create an issue and a handover at their
--     own location
-- ============================================================================
select isnt(
  pg_temp.as_auth_id('0f900000-0000-0000-0000-00000000000c',
    $$ select api.issues_create('0f110000-0000-0000-0000-000000000000',
         '0f100000-0000-0000-0000-000000000001', 'issue', 'fridge is making a loud noise', 'equipment', 'important') $$),
  null, 'B: Staff creates an issue at their own location');

select isnt(
  pg_temp.as_auth_id('0f900000-0000-0000-0000-00000000000c',
    $$ select api.issues_create('0f110000-0000-0000-0000-000000000000',
         '0f100000-0000-0000-0000-000000000001', 'handover', 'low on oat milk, ordered more') $$),
  null, 'B: Staff creates a handover at their own location');

select is(
  (select reported_by_role from issues.issues
    where tenant_id = '0f110000-0000-0000-0000-000000000000'
      and reported_by = '0f900000-0000-0000-0000-00000000000c' and kind = 'issue'),
  'staff', 'B: the created issue is correctly stamped reported_by_role=staff');

select is(
  (select status from issues.issues
    where tenant_id = '0f110000-0000-0000-0000-000000000000'
      and reported_by = '0f900000-0000-0000-0000-00000000000c' and kind = 'handover'),
  'open', 'B: a freshly created handover starts status=open');

-- ============================================================================
-- C — Staff cannot create at a location they don't belong to
-- ============================================================================
select ok(
  pg_temp.as_auth_throws('0f900000-0000-0000-0000-00000000000c',
    $$ select api.issues_create('0f110000-0000-0000-0000-000000000000',
         '0f100000-0000-0000-0000-000000000002', 'issue', 'trying to report at L2 as L1 staff') $$),
  'C: an L1-only Staff member cannot create an issue at L2');

-- ============================================================================
-- D — Staff cannot set reported_by_role='manager' when acting as staff
-- ============================================================================
-- Uses the `authenticated` role (RLS-respecting), NOT `postgres` (RLS-bypass
-- superuser, used elsewhere in this file only to prove guard-trigger/CHECK
-- behaviour that must hold regardless of role) -- this is specifically an
-- RLS-boundary test, so it must actually go through RLS.
select ok(
  pg_temp.as_auth_throws('0f900000-0000-0000-0000-00000000000c',
    $$ insert into issues.issues (tenant_id, location_id, kind, note, reported_by, reported_by_role)
       values ('0f110000-0000-0000-0000-000000000000', '0f100000-0000-0000-0000-000000000001', 'issue',
               'spoofed manager role', '0f900000-0000-0000-0000-00000000000c', 'manager') $$),
  'D: a Staff-only actor claiming reported_by_role=manager is rejected by the INSERT RLS policy');

-- ============================================================================
-- E — Manager can read/resolve at their managed location(s)
-- ============================================================================
select cmp_ok(
  pg_temp.as_auth_count('0f900000-0000-0000-0000-00000000000a',
    $$ select count(*)::int from api.issues where tenant_id = '0f110000-0000-0000-0000-000000000000' $$),
  '>=', 2, 'E: the tenant-wide Manager can read the issues created above');

select lives_ok(
  $$ select pg_temp.as_auth_do('0f900000-0000-0000-0000-00000000000a',
       $q$ select api.issues_resolve('0f110000-0000-0000-0000-000000000000',
             (select id from issues.issues where tenant_id = '0f110000-0000-0000-0000-000000000000'
                and reported_by = '0f900000-0000-0000-0000-00000000000c' and kind = 'issue'),
             'fridge technician fixed it') $q$) $$,
  'E: the Manager resolves the Staff-reported issue');

select is(
  (select status from issues.issues
    where tenant_id = '0f110000-0000-0000-0000-000000000000'
      and reported_by = '0f900000-0000-0000-0000-00000000000c' and kind = 'issue'),
  'resolved', 'E: the issue is now resolved');

select ok(
  pg_temp.as_auth_throws('0f900000-0000-0000-0000-00000000000c',
    $$ select api.issues_resolve('0f110000-0000-0000-0000-000000000000',
         (select id from issues.issues where tenant_id = '0f110000-0000-0000-0000-000000000000'
            and reported_by = '0f900000-0000-0000-0000-00000000000c' and kind = 'handover'),
         'staff cannot resolve') $$),
  'E: Staff (issues.manage not held) cannot resolve an issue -- Manager-only MVP boundary');

-- ============================================================================
-- F — Cross-tenant isolation
-- ============================================================================
select isnt(
  pg_temp.as_auth_id('10900000-0000-0000-0000-00000000000c',
    $$ select api.issues_create('10110000-0000-0000-0000-000000000000',
         '10100000-0000-0000-0000-000000000001', 'issue', 'tenant N own issue') $$),
  null, 'F: tenant N Staff creates their own issue');

select is(
  pg_temp.as_auth_count('0f900000-0000-0000-0000-00000000000a',
    $$ select count(*)::int from api.issues where tenant_id = '10110000-0000-0000-0000-000000000000' $$),
  0, 'F: tenant M Manager reads zero rows for tenant N (RLS tenant isolation)');

select ok(
  pg_temp.as_auth_throws('10900000-0000-0000-0000-00000000000a',
    $$ select api.issues_resolve('0f110000-0000-0000-0000-000000000000',
         (select id from issues.issues where tenant_id = '0f110000-0000-0000-0000-000000000000'
            and kind = 'handover' limit 1), 'cross-tenant attempt') $$),
  'F: tenant N Manager cannot resolve a tenant M row even with a matching permission key');

select ok(
  pg_temp.as_auth_throws('0fff0000-0000-0000-0000-0000000000ff',
    $$ select api.issues_create('0f110000-0000-0000-0000-000000000000',
         '0f100000-0000-0000-0000-000000000001', 'issue', 'outsider attempt') $$),
  'F: a non-member of tenant M cannot create an issue in tenant M');

-- ============================================================================
-- G — Guard trigger: UPDATE on an immutable field fails
-- ============================================================================
select ok(
  pg_temp.as_role_throws('postgres',
    $$ update issues.issues set note = 'edited after the fact'
       where tenant_id = '0f110000-0000-0000-0000-000000000000' and kind = 'handover'
         and reported_by = '0f900000-0000-0000-0000-00000000000c' $$),
  'G: editing note after insert is rejected by the guard trigger');

select ok(
  pg_temp.as_role_throws('postgres',
    $$ update issues.issues set kind = 'issue'
       where tenant_id = '0f110000-0000-0000-0000-000000000000' and kind = 'handover'
         and reported_by = '0f900000-0000-0000-0000-00000000000c' $$),
  'G: editing kind after insert is rejected by the guard trigger');

select ok(
  pg_temp.as_role_throws('postgres',
    $$ update issues.issues set tenant_id = '10110000-0000-0000-0000-000000000000'
       where tenant_id = '0f110000-0000-0000-0000-000000000000' and kind = 'handover'
         and reported_by = '0f900000-0000-0000-0000-00000000000c' $$),
  'G: editing tenant_id after insert is rejected by the guard trigger');

-- ============================================================================
-- H — Status transition coherence: resolved_at only set when
--     status='resolved'; acknowledge/resolve stamp the right actor/timestamp
-- ============================================================================
select ok(
  pg_temp.as_role_throws('postgres',
    $$ insert into issues.issues
         (tenant_id, location_id, kind, note, reported_by, reported_by_role, status, resolved_at)
       values ('0f110000-0000-0000-0000-000000000000', '0f100000-0000-0000-0000-000000000001', 'issue',
               'bad coherence', '0f900000-0000-0000-0000-00000000000a', 'manager', 'open', now()) $$),
  'H: resolved_at set while status=open is rejected by the CHECK constraint');

select ok(
  pg_temp.as_role_throws('postgres',
    $$ insert into issues.issues
         (tenant_id, location_id, kind, note, reported_by, reported_by_role, status)
       values ('0f110000-0000-0000-0000-000000000000', '0f100000-0000-0000-0000-000000000001', 'issue',
               'bad coherence 2', '0f900000-0000-0000-0000-00000000000a', 'manager', 'resolved') $$),
  'H: status=resolved with resolved_at NULL is rejected by the CHECK constraint');

select isnt(
  pg_temp.as_auth_id('0f900000-0000-0000-0000-00000000000c',
    $$ select api.issues_create('0f110000-0000-0000-0000-000000000000',
         '0f100000-0000-0000-0000-000000000001', 'issue', 'freezer door left open', 'equipment', 'normal') $$),
  null, 'H: Staff creates a fresh issue for the acknowledge/resolve lifecycle check');

select lives_ok(
  $$ select pg_temp.as_auth_do('0f900000-0000-0000-0000-00000000000a',
       $q$ select api.issues_acknowledge('0f110000-0000-0000-0000-000000000000',
             (select id from issues.issues where tenant_id = '0f110000-0000-0000-0000-000000000000'
                and note = 'freezer door left open')) $q$) $$,
  'H: the Manager acknowledges the fresh issue');

select is(
  (select status from issues.issues
    where tenant_id = '0f110000-0000-0000-0000-000000000000' and note = 'freezer door left open'),
  'acknowledged', 'H: status is now acknowledged');

select is(
  (select acknowledged_by from issues.issues
    where tenant_id = '0f110000-0000-0000-0000-000000000000' and note = 'freezer door left open'),
  '0f900000-0000-0000-0000-00000000000a'::uuid,
  'H: acknowledged_by is stamped with the acting Manager, not a client-supplied value');

select isnt(
  (select acknowledged_at from issues.issues
    where tenant_id = '0f110000-0000-0000-0000-000000000000' and note = 'freezer door left open'),
  null, 'H: acknowledged_at is stamped');

select ok(
  pg_temp.as_auth_throws('0f900000-0000-0000-0000-00000000000a',
    $$ select api.issues_acknowledge('0f110000-0000-0000-0000-000000000000',
         (select id from issues.issues where tenant_id = '0f110000-0000-0000-0000-000000000000'
            and note = 'freezer door left open')) $$),
  'H: acknowledging an already-acknowledged issue is rejected (not status=open)');

select lives_ok(
  $$ select pg_temp.as_auth_do('0f900000-0000-0000-0000-00000000000a',
       $q$ select api.issues_resolve('0f110000-0000-0000-0000-000000000000',
             (select id from issues.issues where tenant_id = '0f110000-0000-0000-0000-000000000000'
                and note = 'freezer door left open'), 'closed the freezer door') $q$) $$,
  'H: the Manager resolves the acknowledged issue');

select is(
  (select status from issues.issues
    where tenant_id = '0f110000-0000-0000-0000-000000000000' and note = 'freezer door left open'),
  'resolved', 'H: status is now resolved');

select is(
  (select resolved_by from issues.issues
    where tenant_id = '0f110000-0000-0000-0000-000000000000' and note = 'freezer door left open'),
  '0f900000-0000-0000-0000-00000000000a'::uuid,
  'H: resolved_by is stamped with the acting Manager');

select ok(
  pg_temp.as_auth_throws('0f900000-0000-0000-0000-00000000000a',
    $$ select api.issues_resolve('0f110000-0000-0000-0000-000000000000',
         (select id from issues.issues where tenant_id = '0f110000-0000-0000-0000-000000000000'
            and note = 'freezer door left open'), 'double resolve') $$),
  'H: resolving an already-resolved issue is rejected');

-- resolve-without-acknowledge auto-stamps acknowledged_* (coherence CHECK).
select isnt(
  pg_temp.as_auth_id('0f900000-0000-0000-0000-00000000000c',
    $$ select api.issues_create('0f110000-0000-0000-0000-000000000000',
         '0f100000-0000-0000-0000-000000000001', 'issue', 'skip-ack straight to resolve') $$),
  null, 'H: Staff creates an issue for the skip-acknowledge path');

select lives_ok(
  $$ select pg_temp.as_auth_do('0f900000-0000-0000-0000-00000000000a',
       $q$ select api.issues_resolve('0f110000-0000-0000-0000-000000000000',
             (select id from issues.issues where tenant_id = '0f110000-0000-0000-0000-000000000000'
                and note = 'skip-ack straight to resolve'), 'handled directly') $q$) $$,
  'H: the Manager resolves directly from open, skipping acknowledge');

select isnt(
  (select acknowledged_at from issues.issues
    where tenant_id = '0f110000-0000-0000-0000-000000000000' and note = 'skip-ack straight to resolve'),
  null, 'H: acknowledged_at is auto-stamped when resolving directly from open');

-- ============================================================================
-- I — api.issues_open excludes resolved rows; api.issues includes everything
--     visible per RLS
-- ============================================================================
select is(
  pg_temp.as_auth_count('0f900000-0000-0000-0000-00000000000a',
    $$ select count(*)::int from api.issues_open where tenant_id = '0f110000-0000-0000-0000-000000000000'
       and note in ('freezer door left open', 'skip-ack straight to resolve') $$),
  0, 'I: api.issues_open excludes the two now-resolved rows');

select cmp_ok(
  pg_temp.as_auth_count('0f900000-0000-0000-0000-00000000000a',
    $$ select count(*)::int from api.issues where tenant_id = '0f110000-0000-0000-0000-000000000000'
       and note in ('freezer door left open', 'skip-ack straight to resolve') $$),
  '=', 2, 'I: api.issues (full history) still includes the resolved rows');

select is(
  pg_temp.as_auth_count('0f900000-0000-0000-0000-00000000000c',
    $$ select count(*)::int from api.issues_open where tenant_id = '0f110000-0000-0000-0000-000000000000'
       and reported_by = '0f900000-0000-0000-0000-00000000000c' and kind = 'handover' $$),
  1, 'I: the still-open handover appears in api.issues_open for the Staff reporter');

-- anon cannot read either view.
select ok(
  pg_temp.as_role_throws('anon', $$ select 1 from api.issues limit 1 $$),
  'RLS: anon cannot read api.issues');
select ok(
  pg_temp.as_role_throws('anon', $$ select 1 from api.issues_open limit 1 $$),
  'RLS: anon cannot read api.issues_open');

select * from finish();
rollback;
