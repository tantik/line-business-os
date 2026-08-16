-- ============================================================================
-- DB test: Workforce Cafe v0.1 Slice 1C -- write facade (migration
--          0031_workforce_cafe_write_facade.sql)
-- ----------------------------------------------------------------------------
-- Run with:  pnpm exec supabase db reset && pnpm exec supabase test db
--
-- Proves: write grants on the 4 0030 views, the new read-only
-- api.workforce_employee_line_links view (no PII columns), the new
-- api.workforce_staff_manage view (opaque name_encrypted/name_hash, no raw
-- user ids), the two bind/unbind RPCs (SECURITY INVOKER, RLS still the real
-- boundary, atomic rebind), and the decided_by/decided_at server-stamp
-- trigger. Anon stays fully denied throughout.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, audit, workforce, booking, ai, api;

select no_plan();

-- ============================================================================
-- Section 1: role-hop helpers
-- ============================================================================

-- Runs p_sql as `authenticated` impersonating p_sub; returns the first column
-- of the first row cast to text. Mirrors 0012's as_auth_count for scalar
-- reads/writes expected to succeed.
create function pg_temp.as_auth_scalar(p_sub text, p_sql text)
returns text
language plpgsql
as $$
declare v text;
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

-- Runs p_sql as `authenticated` impersonating p_sub; returns true if it
-- completed without error, false if it raised (e.g. an RLS WITH CHECK
-- violation on an INSERT, which errors rather than silently filtering).
create function pg_temp.as_auth_ok(p_sub text, p_sql text)
returns boolean
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('app.current_user_id', '', true);
  perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  set local role authenticated;
  execute p_sql;
  reset role;
  return true;
exception when others then
  reset role;
  return false;
end;
$$;

create function pg_temp.as_auth_count(p_sub text, p_sql text)
returns int
language plpgsql
as $$
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

-- ============================================================================
-- Section 2: fixtures
-- ============================================================================

insert into core.tenants (id, slug, name) values
  ('cf000000-0000-0000-0000-00000000000f', 'pgtap-cafe1c-tenant-f', 'pgTAP Cafe 1C Tenant F');

insert into core.locations (id, tenant_id, name) values
  ('cf200000-0000-0000-0000-000000000001', 'cf000000-0000-0000-0000-00000000000f', 'Tenant F Location 1');

insert into core.users (id, display_name) values
  ('cf900000-0000-0000-0000-000000000001', 'Staff 1'),
  ('cf900000-0000-0000-0000-000000000002', 'Manager (Location 1)');

insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('cf000000-0000-0000-0000-00000000000f', 'cf900000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000006', 'cf200000-0000-0000-0000-000000000001'), -- employee
  ('cf000000-0000-0000-0000-00000000000f', 'cf900000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000005', 'cf200000-0000-0000-0000-000000000001'); -- manager

insert into workforce.employees (id, tenant_id, location_id, user_id, name_encrypted) values
  ('cf300000-0000-0000-0000-000000000001', 'cf000000-0000-0000-0000-00000000000f',
   'cf200000-0000-0000-0000-000000000001', 'cf900000-0000-0000-0000-000000000001', '\x00');

insert into workforce.shift_requests (id, tenant_id, location_id, employee_id, kind, work_date, status) values
  ('cf600000-0000-0000-0000-000000000001', 'cf000000-0000-0000-0000-00000000000f',
   'cf200000-0000-0000-0000-000000000001', 'cf300000-0000-0000-0000-000000000001',
   'correction', '2026-08-10', 'pending');

-- ============================================================================
-- Section 3: structural
-- ============================================================================

select has_view('api', 'workforce_employee_line_links', 'api.workforce_employee_line_links view exists');
select has_view('api', 'workforce_staff_manage', 'api.workforce_staff_manage view exists');

select ok(
  (select bool_and(
     exists (
       select 1
       from pg_class c2
       join pg_namespace n2 on n2.oid = c2.relnamespace
       cross join lateral unnest(c2.reloptions) o(opt)
       where n2.nspname = 'api' and c2.relname = v.viewname
         and lower(o.opt) = 'security_invoker=true'
     )
   )
   from (values ('workforce_employee_line_links'), ('workforce_staff_manage')) as v(viewname)),
  'both new workforce cafe api views are security_invoker'
);

select is(
  (select array_agg(column_name::text order by ordinal_position)
     from information_schema.columns
    where table_schema = 'api' and table_name = 'workforce_employee_line_links'),
  array['link_id', 'tenant_id', 'employee_id', 'is_active', 'linked_at', 'created_at', 'updated_at']::text[],
  'api.workforce_employee_line_links exposes no line_user_id_encrypted/line_user_id_hash'
);
select is(
  (select array_agg(column_name::text order by ordinal_position)
     from information_schema.columns
    where table_schema = 'api' and table_name = 'workforce_staff_manage'),
  array[
    'staff_id', 'tenant_id', 'location_id', 'name_encrypted', 'name_hash',
    'position_label', 'employment_type', 'is_active', 'created_at', 'updated_at', 'hourly_wage_yen',
    'family_name_encrypted', 'given_name_encrypted', 'email_encrypted', 'email_hash', 'notes_encrypted',
    -- 0067_workforce_staff_manage_account_access.sql: a later, separate
    -- migration. Derived boolean only (user_id is not null) -- still no raw
    -- user_id/created_by/updated_by.
    'has_account_access'
  ]::text[],
  'api.workforce_staff_manage exposes no user_id/created_by/updated_by (beyond the derived has_account_access boolean)'
);

select has_function('api', 'bind_workforce_employee_line_user',
  array['uuid', 'uuid', 'bytea', 'text'], 'api.bind_workforce_employee_line_user exists');
select has_function('api', 'unbind_workforce_employee_line_user',
  array['uuid', 'uuid'], 'api.unbind_workforce_employee_line_user exists');

select is(
  (select count(*)::int
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'api'
      and p.proname in ('bind_workforce_employee_line_user', 'unbind_workforce_employee_line_user')
      and p.prosecdef),
  0,
  'bind/unbind RPCs are SECURITY INVOKER, not SECURITY DEFINER'
);

select has_column('workforce', 'shift_requests', 'decided_at', 'workforce.shift_requests.decided_at exists');
select ok(
  exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'workforce' and c.relname = 'shift_requests'
      and t.tgname = 'stamp_shift_request_decision' and not t.tgisinternal
  ),
  'stamp_shift_request_decision trigger exists on workforce.shift_requests'
);

-- ============================================================================
-- Section 4: grants
-- ============================================================================

select ok(not has_table_privilege('anon', 'api.workforce_employee_line_links', 'SELECT'),
  'anon cannot SELECT api.workforce_employee_line_links');
select ok(not has_table_privilege('anon', 'api.workforce_staff_manage', 'SELECT'),
  'anon cannot SELECT api.workforce_staff_manage');
select ok(not has_function_privilege('anon', 'api.bind_workforce_employee_line_user(uuid,uuid,bytea,text)', 'EXECUTE'),
  'anon cannot EXECUTE api.bind_workforce_employee_line_user');
select ok(not has_function_privilege('anon', 'api.unbind_workforce_employee_line_user(uuid,uuid)', 'EXECUTE'),
  'anon cannot EXECUTE api.unbind_workforce_employee_line_user');

select ok(has_table_privilege('authenticated', 'api.workforce_employee_line_links', 'SELECT'),
  'authenticated can SELECT api.workforce_employee_line_links');
select ok(not has_table_privilege('authenticated', 'api.workforce_employee_line_links', 'INSERT'),
  'authenticated has no direct INSERT on api.workforce_employee_line_links (writes go through the RPCs)');
select ok(has_table_privilege('authenticated', 'api.workforce_staff_manage', 'SELECT')
      and has_table_privilege('authenticated', 'api.workforce_staff_manage', 'INSERT')
      and has_table_privilege('authenticated', 'api.workforce_staff_manage', 'UPDATE'),
  'authenticated can SELECT/INSERT/UPDATE api.workforce_staff_manage');
select ok(has_function_privilege('authenticated', 'api.bind_workforce_employee_line_user(uuid,uuid,bytea,text)', 'EXECUTE'),
  'authenticated can EXECUTE api.bind_workforce_employee_line_user');
select ok(has_function_privilege('authenticated', 'api.unbind_workforce_employee_line_user(uuid,uuid)', 'EXECUTE'),
  'authenticated can EXECUTE api.unbind_workforce_employee_line_user');

-- ============================================================================
-- Section 5: behavioral
-- ============================================================================

-- Manager can insert a draft shift assignment via the now-writable view.
select ok(
  pg_temp.as_auth_ok('cf900000-0000-0000-0000-000000000002',
    $q$ insert into api.workforce_shift_assignments
          (tenant_id, location_id, employee_id, starts_at, ends_at, published)
        values ('cf000000-0000-0000-0000-00000000000f', 'cf200000-0000-0000-0000-000000000001',
                'cf300000-0000-0000-0000-000000000001', '2026-08-03 09:00+09', '2026-08-03 13:00+09', false) $q$),
  'manager can INSERT a draft shift assignment via api.workforce_shift_assignments'
);
select is(
  (select count(*)::int from workforce.shifts
    where tenant_id = 'cf000000-0000-0000-0000-00000000000f' and published = false),
  1, 'the draft shift assignment actually landed in workforce.shifts'
);

-- Staff (employee role, no shift.write/staff.manage) cannot.
select ok(
  not pg_temp.as_auth_ok('cf900000-0000-0000-0000-000000000001',
    $q$ insert into api.workforce_shift_assignments
          (tenant_id, location_id, employee_id, starts_at, ends_at, published)
        values ('cf000000-0000-0000-0000-00000000000f', 'cf200000-0000-0000-0000-000000000001',
                'cf300000-0000-0000-0000-000000000001', '2026-08-04 09:00+09', '2026-08-04 13:00+09', false) $q$),
  'staff (non-manager) cannot INSERT via api.workforce_shift_assignments'
);

-- bind: manager can bind, and rebinding deactivates the prior link atomically.
select is(
  pg_temp.as_auth_scalar('cf900000-0000-0000-0000-000000000002',
    $q$ select is_active::text from api.bind_workforce_employee_line_user(
          'cf000000-0000-0000-0000-00000000000f', 'cf300000-0000-0000-0000-000000000001',
          '\x0101'::bytea, 'hash-one') $q$),
  'true', 'manager can bind a LINE user via the RPC'
);
select is(
  pg_temp.as_auth_scalar('cf900000-0000-0000-0000-000000000002',
    $q$ select is_active::text from api.bind_workforce_employee_line_user(
          'cf000000-0000-0000-0000-00000000000f', 'cf300000-0000-0000-0000-000000000001',
          '\x0202'::bytea, 'hash-two') $q$),
  'true', 'manager can rebind the same employee to a different LINE user'
);
select is(
  (select count(*)::int from workforce.employee_line_links
    where employee_id = 'cf300000-0000-0000-0000-000000000001' and is_active = true),
  1, 'rebinding leaves exactly one active binding (atomic deactivate-then-insert)'
);
select is(
  (select line_user_id_hash from workforce.employee_line_links
    where employee_id = 'cf300000-0000-0000-0000-000000000001' and is_active = true),
  'hash-two', 'the active binding is the most recent bind call'
);

-- Staff (non-manager) cannot bind.
select ok(
  not pg_temp.as_auth_ok('cf900000-0000-0000-0000-000000000001',
    $q$ select * from api.bind_workforce_employee_line_user(
          'cf000000-0000-0000-0000-00000000000f', 'cf300000-0000-0000-0000-000000000001',
          '\x0303'::bytea, 'hash-three') $q$),
  'staff (non-manager) cannot bind via the RPC'
);

-- unbind: manager can unbind; a second call is a no-op (0 rows), not an error.
select is(
  pg_temp.as_auth_scalar('cf900000-0000-0000-0000-000000000002',
    $q$ select api.unbind_workforce_employee_line_user(
          'cf000000-0000-0000-0000-00000000000f', 'cf300000-0000-0000-0000-000000000001')::text $q$),
  '1', 'manager can unbind the active LINE user link'
);
select is(
  pg_temp.as_auth_scalar('cf900000-0000-0000-0000-000000000002',
    $q$ select api.unbind_workforce_employee_line_user(
          'cf000000-0000-0000-0000-00000000000f', 'cf300000-0000-0000-0000-000000000001')::text $q$),
  '0', 'unbinding again with nothing active is a no-op, not an error'
);

-- decided_at/decided_by trigger: manager decides the pending correction via
-- the view; decided_by/decided_at land server-side even though the view never
-- exposes them.
select ok(
  pg_temp.as_auth_ok('cf900000-0000-0000-0000-000000000002',
    $q$ update api.workforce_shift_requests set status = 'approved'
        where request_id = 'cf600000-0000-0000-0000-000000000001' $q$),
  'manager can decide the pending correction request via api.workforce_shift_requests'
);
select is(
  (select status::text from workforce.shift_requests where id = 'cf600000-0000-0000-0000-000000000001'),
  'approved', 'status was actually updated'
);
select is(
  (select decided_by from workforce.shift_requests where id = 'cf600000-0000-0000-0000-000000000001'),
  'cf900000-0000-0000-0000-000000000002', 'decided_by was server-stamped to the deciding manager, never client-supplied'
);
select ok(
  (select decided_at is not null from workforce.shift_requests where id = 'cf600000-0000-0000-0000-000000000001'),
  'decided_at was server-stamped'
);

select * from finish();
rollback;
