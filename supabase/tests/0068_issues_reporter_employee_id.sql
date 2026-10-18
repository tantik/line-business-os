-- ============================================================================
-- DB test: migration 0128 (api.issues / api.issues_open expose
-- reporter_employee_id, visible only where the caller may read that
-- workforce.employees row).
-- ----------------------------------------------------------------------------
-- Run with:  pnpm exec supabase db reset && pnpm exec supabase test db
--   A  Manager sees the Staff reporter's employee id (open feed + history)
--   B  the Staff reporter sees their own employee id
--   C  an active coworker at the same location sees the reporter's id
--   D  a deactivated reporter: the coworker gets NULL, the Manager still sees it
--   E  a reporter with no employee row (Manager-only user) gives NULL
--   F  an employee row of the same user in ANOTHER tenant is never joined
--   G  the view adds no rows (LEFT JOIN, one row per issue)
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, audit, workforce, issues, ai;

select no_plan();

-- --- Fixtures ---------------------------------------------------------------
insert into core.tenants (id, slug, name) values
  ('a8000000-0000-0000-0000-00000000000a', 'pgtap-0128-a', 'pgTAP 0128 A'),
  ('a8000000-0000-0000-0000-00000000000b', 'pgtap-0128-b', 'pgTAP 0128 B');

insert into core.tenant_modules (tenant_id, module, is_enabled) values
  ('a8000000-0000-0000-0000-00000000000a', 'issues', true),
  ('a8000000-0000-0000-0000-00000000000a', 'workforce', true),
  ('a8000000-0000-0000-0000-00000000000b', 'issues', true),
  ('a8000000-0000-0000-0000-00000000000b', 'workforce', true);

insert into core.locations (id, tenant_id, name, timezone) values
  ('a8200000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-00000000000a', 'A / L1', 'Asia/Tokyo'),
  ('a8200000-0000-0000-0000-000000000002', 'a8000000-0000-0000-0000-00000000000b', 'B / L1', 'Asia/Tokyo');

insert into core.users (id, display_name) values
  ('a8900000-0000-0000-0000-000000000001', 'Staff reporter'),
  ('a8900000-0000-0000-0000-000000000002', 'Coworker'),
  ('a8900000-0000-0000-0000-000000000003', 'Manager without employee row'),
  ('a8900000-0000-0000-0000-000000000004', 'Staff reporter later deactivated');

-- employee = ...006, manager = ...005
insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('a8000000-0000-0000-0000-00000000000a', 'a8900000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000006', 'a8200000-0000-0000-0000-000000000001'),
  ('a8000000-0000-0000-0000-00000000000a', 'a8900000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000006', 'a8200000-0000-0000-0000-000000000001'),
  ('a8000000-0000-0000-0000-00000000000a', 'a8900000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000005', 'a8200000-0000-0000-0000-000000000001'),
  ('a8000000-0000-0000-0000-00000000000a', 'a8900000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000006', 'a8200000-0000-0000-0000-000000000001'),
  ('a8000000-0000-0000-0000-00000000000b', 'a8900000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000006', 'a8200000-0000-0000-0000-000000000002');

insert into core.tenant_memberships (tenant_id, user_id, status) values
  ('a8000000-0000-0000-0000-00000000000a', 'a8900000-0000-0000-0000-000000000001', 'active'),
  ('a8000000-0000-0000-0000-00000000000a', 'a8900000-0000-0000-0000-000000000002', 'active'),
  ('a8000000-0000-0000-0000-00000000000a', 'a8900000-0000-0000-0000-000000000003', 'active'),
  ('a8000000-0000-0000-0000-00000000000a', 'a8900000-0000-0000-0000-000000000004', 'active'),
  ('a8000000-0000-0000-0000-00000000000b', 'a8900000-0000-0000-0000-000000000003', 'active');

insert into workforce.employees (id, tenant_id, location_id, user_id, name_encrypted, is_active) values
  ('a8300000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-00000000000a', 'a8200000-0000-0000-0000-000000000001', 'a8900000-0000-0000-0000-000000000001', '\x00', true),
  ('a8300000-0000-0000-0000-000000000002', 'a8000000-0000-0000-0000-00000000000a', 'a8200000-0000-0000-0000-000000000001', 'a8900000-0000-0000-0000-000000000002', '\x00', true),
  ('a8300000-0000-0000-0000-000000000004', 'a8000000-0000-0000-0000-00000000000a', 'a8200000-0000-0000-0000-000000000001', 'a8900000-0000-0000-0000-000000000004', '\x00', true),
  -- the Manager user is an employee only in tenant B
  ('a8300000-0000-0000-0000-0000000000b3', 'a8000000-0000-0000-0000-00000000000b', 'a8200000-0000-0000-0000-000000000002', 'a8900000-0000-0000-0000-000000000003', '\x00', true);

-- Issues seeded as postgres (the RPC path is covered by 0059/0063).
insert into issues.issues (id, tenant_id, location_id, kind, note, reported_by, reported_by_role) values
  ('a8400000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-00000000000a', 'a8200000-0000-0000-0000-000000000001', 'issue', 'by staff', 'a8900000-0000-0000-0000-000000000001', 'staff'),
  ('a8400000-0000-0000-0000-000000000003', 'a8000000-0000-0000-0000-00000000000a', 'a8200000-0000-0000-0000-000000000001', 'handover', 'by manager', 'a8900000-0000-0000-0000-000000000003', 'manager'),
  ('a8400000-0000-0000-0000-000000000004', 'a8000000-0000-0000-0000-00000000000a', 'a8200000-0000-0000-0000-000000000001', 'issue', 'by later-deactivated staff', 'a8900000-0000-0000-0000-000000000004', 'staff');

create function pg_temp.reporter_of(p_sub text, p_view text, p_issue uuid)
returns uuid language plpgsql as $$
declare v uuid;
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('app.current_user_id', '', true);
  perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  set local role authenticated;
  execute format('select reporter_employee_id from api.%I where issue_id = $1', p_view) into v using p_issue;
  reset role;
  return v;
end;
$$;

create function pg_temp.count_as(p_sub text, p_sql text)
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

-- A
select is(pg_temp.reporter_of('a8900000-0000-0000-0000-000000000003', 'issues_open', 'a8400000-0000-0000-0000-000000000001'),
  'a8300000-0000-0000-0000-000000000001'::uuid, 'A: Manager sees the Staff reporter''s employee id (issues_open)');
select is(pg_temp.reporter_of('a8900000-0000-0000-0000-000000000003', 'issues', 'a8400000-0000-0000-0000-000000000001'),
  'a8300000-0000-0000-0000-000000000001'::uuid, 'A: Manager sees the Staff reporter''s employee id (issues)');

-- B
select is(pg_temp.reporter_of('a8900000-0000-0000-0000-000000000001', 'issues_open', 'a8400000-0000-0000-0000-000000000001'),
  'a8300000-0000-0000-0000-000000000001'::uuid, 'B: the Staff reporter sees their own employee id');

-- C
select is(pg_temp.reporter_of('a8900000-0000-0000-0000-000000000002', 'issues_open', 'a8400000-0000-0000-0000-000000000001'),
  'a8300000-0000-0000-0000-000000000001'::uuid, 'C: an active coworker at the same location sees the reporter''s id');

select is(pg_temp.reporter_of('a8900000-0000-0000-0000-000000000002', 'issues', 'a8400000-0000-0000-0000-000000000001'),
  'a8300000-0000-0000-0000-000000000001'::uuid, 'C: same for the full-history view (issues)');

-- D
update workforce.employees set is_active = false where id = 'a8300000-0000-0000-0000-000000000004';
select is(pg_temp.reporter_of('a8900000-0000-0000-0000-000000000002', 'issues_open', 'a8400000-0000-0000-0000-000000000004'),
  null::uuid, 'D: a deactivated reporter is not resolved for a coworker (roster hides inactive coworkers)');
select is(pg_temp.reporter_of('a8900000-0000-0000-0000-000000000003', 'issues_open', 'a8400000-0000-0000-0000-000000000004'),
  'a8300000-0000-0000-0000-000000000004'::uuid, 'D: the Manager still sees a deactivated reporter''s id');

-- E + F
select is(pg_temp.reporter_of('a8900000-0000-0000-0000-000000000003', 'issues_open', 'a8400000-0000-0000-0000-000000000003'),
  null::uuid, 'E/F: a Manager reporter with no employee row in this tenant gives NULL; their tenant-B employee row is never joined');
select is(pg_temp.reporter_of('a8900000-0000-0000-0000-000000000001', 'issues', 'a8400000-0000-0000-0000-000000000003'),
  null::uuid, 'E/F: same row seen by Staff is NULL');

select is(pg_temp.reporter_of('a8900000-0000-0000-0000-000000000002', 'issues', 'a8400000-0000-0000-0000-000000000004'),
  null::uuid, 'D: same for the full-history view (issues)');

-- H: workforce module OFF (issues ON) -> the issue is still readable, the id is NULL, no error
update core.tenant_modules set is_enabled = false
  where tenant_id = 'a8000000-0000-0000-0000-00000000000a' and module = 'workforce';
select is(pg_temp.reporter_of('a8900000-0000-0000-0000-000000000002', 'issues_open', 'a8400000-0000-0000-0000-000000000001'),
  null::uuid, 'H: workforce OFF hides the coworker reporter id');
select is(pg_temp.count_as('a8900000-0000-0000-0000-000000000002',
    $$ select count(*)::int from api.issues_open where tenant_id = 'a8000000-0000-0000-0000-00000000000a' $$),
  3, 'H: workforce OFF still returns every open issue (LEFT JOIN)');
update core.tenant_modules set is_enabled = true
  where tenant_id = 'a8000000-0000-0000-0000-00000000000a' and module = 'workforce';

-- G
select is(pg_temp.count_as('a8900000-0000-0000-0000-000000000003',
    $$ select count(*)::int from api.issues where tenant_id = 'a8000000-0000-0000-0000-00000000000a' $$),
  3, 'G: one view row per issue (LEFT JOIN adds or loses nothing)');

select * from finish();
rollback;
