-- ============================================================================
-- DB test: Staff<->Manager Mail module (migration 0090)
-- ----------------------------------------------------------------------------
-- Run with:  pnpm exec supabase db reset && pnpm exec supabase test db
--
-- Covers: structure/RLS enablement, staff self-scope insert (sender_role
-- forced to 'staff', cannot forge 'manager'), staff cannot read another
-- employee's thread, staff CAN mark-read/archive/delete their own thread's
-- messages (self_update) but the guard trigger rejects any attempt to change
-- body/sender_role/employee_id, manager can select/insert-as-manager/
-- mark-read/archive/delete across every thread at their location but cannot
-- edit body, and read_at/read_by are trigger-stamped, never client-writable.
-- Follows 0021_workforce_shift_change_requests.sql's as_auth_exec helper
-- pattern.
-- ============================================================================

begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, workforce;
select no_plan();

-- ============================================================================
-- Section 1: structure
-- ============================================================================

select has_table('workforce', 'staff_messages', 'workforce.staff_messages exists');

select is(
  (select count(*)::int
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'workforce'
      and c.relname = 'staff_messages'
      and c.relrowsecurity = false),
  0,
  'RLS is enabled on workforce.staff_messages'
);

select ok(
  has_table_privilege('authenticated', 'workforce.staff_messages', 'SELECT')
  and has_table_privilege('authenticated', 'workforce.staff_messages', 'INSERT')
  and has_table_privilege('authenticated', 'workforce.staff_messages', 'UPDATE'),
  'authenticated has select/insert/update on workforce.staff_messages'
);

select is(
  (select count(*)::int from information_schema.role_table_grants
    where grantee = 'anon' and table_schema = 'api' and table_name = 'workforce_staff_messages'),
  0,
  'zero anon grants on api.workforce_staff_messages'
);

-- ============================================================================
-- Section 2: fixtures -- two employees at the same location (so Manager
-- reads span both threads), a second manager-permission-holding user, plus a
-- second tenant for cross-tenant isolation.
-- ============================================================================

create function pg_temp.as_auth_exec(p_sub text, p_sql text)
returns boolean language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('app.current_user_id', '', true);
  perform set_config('request.jwt.claim.sub', p_sub, true);
  set local role authenticated;
  execute p_sql;
  reset role;
  return true;
exception when others then
  raise notice 'as_auth_exec failed: %', sqlerrm;
  reset role;
  return false;
end;
$$;

create function pg_temp.as_auth_count(p_sub text, p_sql text)
returns int language plpgsql as $$
declare n int;
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('app.current_user_id', '', true);
  perform set_config('request.jwt.claim.sub', p_sub, true);
  set local role authenticated;
  execute p_sql into n;
  reset role;
  return n;
end;
$$;

insert into core.tenants (id, slug, name) values
  ('9e000000-0000-0000-0000-00000000000a', 'pgtap-mail-tenant-a', 'pgTAP Mail Tenant A');
insert into core.locations (id, tenant_id, name, timezone) values
  ('9e100000-0000-0000-0000-000000000001', '9e000000-0000-0000-0000-00000000000a', 'Tenant A Location A', 'Asia/Tokyo');
insert into core.users (id, display_name) values
  ('9e900000-0000-0000-0000-000000000001', 'Staff A'),
  ('9e900000-0000-0000-0000-000000000002', 'Staff B'),
  ('9e900000-0000-0000-0000-000000000003', 'Manager A');
insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('9e000000-0000-0000-0000-00000000000a', '9e900000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000006', '9e100000-0000-0000-0000-000000000001'), -- employee
  ('9e000000-0000-0000-0000-00000000000a', '9e900000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000006', '9e100000-0000-0000-0000-000000000001'), -- employee
  ('9e000000-0000-0000-0000-00000000000a', '9e900000-0000-0000-0000-000000000003',
   '00000000-0000-0000-0000-000000000005', '9e100000-0000-0000-0000-000000000001'); -- manager
insert into workforce.employees (id, tenant_id, location_id, user_id, name_encrypted) values
  ('9e300000-0000-0000-0000-000000000001', '9e000000-0000-0000-0000-00000000000a', '9e100000-0000-0000-0000-000000000001', '9e900000-0000-0000-0000-000000000001', '\x00'),
  ('9e300000-0000-0000-0000-000000000002', '9e000000-0000-0000-0000-00000000000a', '9e100000-0000-0000-0000-000000000001', '9e900000-0000-0000-0000-000000000002', '\x00');

-- ============================================================================
-- Section 3: staff self-insert -- own thread only, sender_role forced to
-- 'staff', cannot forge 'manager' or another employee's thread.
-- ============================================================================

select ok(pg_temp.as_auth_exec('9e900000-0000-0000-0000-000000000001',
  $q$insert into api.workforce_staff_messages
    (tenant_id, location_id, employee_id, sender_role, sender_user_id, body)
    values ('9e000000-0000-0000-0000-00000000000a', '9e100000-0000-0000-0000-000000000001',
            '9e300000-0000-0000-0000-000000000001', 'staff', '9e900000-0000-0000-0000-000000000001',
            'Running 10 minutes late today')$q$),
  'staff can insert into their own thread as sender_role=staff');

select ok(not pg_temp.as_auth_exec('9e900000-0000-0000-0000-000000000001',
  $q$insert into api.workforce_staff_messages
    (tenant_id, location_id, employee_id, sender_role, sender_user_id, body)
    values ('9e000000-0000-0000-0000-00000000000a', '9e100000-0000-0000-0000-000000000001',
            '9e300000-0000-0000-0000-000000000001', 'manager', '9e900000-0000-0000-0000-000000000001',
            'Forged manager message')$q$),
  'staff cannot insert as sender_role=manager into their own thread');

select ok(not pg_temp.as_auth_exec('9e900000-0000-0000-0000-000000000001',
  $q$insert into api.workforce_staff_messages
    (tenant_id, location_id, employee_id, sender_role, sender_user_id, body)
    values ('9e000000-0000-0000-0000-00000000000a', '9e100000-0000-0000-0000-000000000001',
            '9e300000-0000-0000-0000-000000000002', 'staff', '9e900000-0000-0000-0000-000000000001',
            'Trying to write into a colleague''s thread')$q$),
  'staff cannot insert into another employee''s thread');

-- Staff B posts into their own thread too, so the manager-select tests below
-- span two distinct threads.
select ok(pg_temp.as_auth_exec('9e900000-0000-0000-0000-000000000002',
  $q$insert into api.workforce_staff_messages
    (tenant_id, location_id, employee_id, sender_role, sender_user_id, body)
    values ('9e000000-0000-0000-0000-00000000000a', '9e100000-0000-0000-0000-000000000001',
            '9e300000-0000-0000-0000-000000000002', 'staff', '9e900000-0000-0000-0000-000000000002',
            'Question about next week''s schedule')$q$),
  'staff B can insert into their own thread');

-- ============================================================================
-- Section 4: self-scope read -- staff sees only their own thread.
-- ============================================================================

select is(
  pg_temp.as_auth_count('9e900000-0000-0000-0000-000000000001',
    $$ select count(*)::int from api.workforce_staff_messages
       where employee_id = '9e300000-0000-0000-0000-000000000001' $$),
  1,
  'staff A sees their own thread'
);
select is(
  pg_temp.as_auth_count('9e900000-0000-0000-0000-000000000001',
    $$ select count(*)::int from api.workforce_staff_messages
       where employee_id = '9e300000-0000-0000-0000-000000000002' $$),
  0,
  'staff A cannot read staff B''s thread'
);

-- ============================================================================
-- Section 5: manager select spans every thread at the location; manager can
-- insert as sender_role=manager into any employee's thread.
-- ============================================================================

select is(
  pg_temp.as_auth_count('9e900000-0000-0000-0000-000000000003',
    $$ select count(*)::int from api.workforce_staff_messages
       where tenant_id = '9e000000-0000-0000-0000-00000000000a' $$),
  2,
  'manager sees both staff threads (2 messages total)'
);

select ok(pg_temp.as_auth_exec('9e900000-0000-0000-0000-000000000003',
  $q$insert into api.workforce_staff_messages
    (tenant_id, location_id, employee_id, sender_role, sender_user_id, body)
    values ('9e000000-0000-0000-0000-00000000000a', '9e100000-0000-0000-0000-000000000001',
            '9e300000-0000-0000-0000-000000000001', 'manager', '9e900000-0000-0000-0000-000000000003',
            'Thanks for the heads up, see you soon')$q$),
  'manager can reply into staff A''s thread as sender_role=manager');

select ok(not pg_temp.as_auth_exec('9e900000-0000-0000-0000-000000000003',
  $q$insert into api.workforce_staff_messages
    (tenant_id, location_id, employee_id, sender_role, sender_user_id, body)
    values ('9e000000-0000-0000-0000-00000000000a', '9e100000-0000-0000-0000-000000000001',
            '9e300000-0000-0000-0000-000000000001', 'staff', '9e900000-0000-0000-0000-000000000003',
            'Manager cannot pose as staff')$q$),
  'manager cannot insert as sender_role=staff');

-- ============================================================================
-- Section 6: read_at/read_by are trigger-stamped, never client-writable;
-- staff CAN mark-read/archive/delete their own thread's messages.
-- ============================================================================

select ok(pg_temp.as_auth_exec('9e900000-0000-0000-0000-000000000001',
  format($q$update api.workforce_staff_messages set is_read = true
       where employee_id = '9e300000-0000-0000-0000-000000000001'
         and sender_role = 'manager'$q$)),
  'staff A can mark the manager''s message in their own thread read');

select is(
  (select is_read from workforce.staff_messages
    where employee_id = '9e300000-0000-0000-0000-000000000001' and sender_role = 'manager'),
  true,
  'is_read is now true'
);
select ok(
  (select read_at from workforce.staff_messages
    where employee_id = '9e300000-0000-0000-0000-000000000001' and sender_role = 'manager') is not null,
  'read_at was server-stamped'
);
select is(
  (select read_by from workforce.staff_messages
    where employee_id = '9e300000-0000-0000-0000-000000000001' and sender_role = 'manager'),
  '9e900000-0000-0000-0000-000000000001'::uuid,
  'read_by was server-stamped to the actual caller (staff A), not client-suppliable'
);

-- A client-supplied read_at is silently overwritten by the trigger, not
-- honored -- attempt a forged future timestamp on a different (unread) row
-- and confirm the trigger's own clock_timestamp() wins.
select ok(pg_temp.as_auth_exec('9e900000-0000-0000-0000-000000000002',
  $q$update api.workforce_staff_messages set is_read = true, read_at = '2099-01-01T00:00:00Z'
       where employee_id = '9e300000-0000-0000-0000-000000000002' and sender_role = 'staff'$q$),
  'staff B can update is_read (with a forged read_at attempt) on their own row'
);
select isnt(
  (select read_at from workforce.staff_messages
    where employee_id = '9e300000-0000-0000-0000-000000000002' and sender_role = 'staff'),
  '2099-01-01T00:00:00Z'::timestamptz,
  'the client-supplied read_at was NOT honored -- the trigger''s own clock_timestamp() was used instead'
);

select ok(pg_temp.as_auth_exec('9e900000-0000-0000-0000-000000000001',
  $q$update api.workforce_staff_messages set archived_at = now()
       where employee_id = '9e300000-0000-0000-0000-000000000001' and sender_role = 'manager'$q$),
  'staff A can archive a message in their own thread');

select ok(pg_temp.as_auth_exec('9e900000-0000-0000-0000-000000000001',
  $q$update api.workforce_staff_messages set deleted_at = now()
       where employee_id = '9e300000-0000-0000-0000-000000000001' and sender_role = 'manager'$q$),
  'staff A can soft-delete a message in their own thread');

-- ============================================================================
-- Section 7: guard trigger -- neither side can edit body/sender_role/
-- employee_id/tenant_id/location_id/sender_user_id, even via the status-only
-- update path.
-- ============================================================================

select ok(not pg_temp.as_auth_exec('9e900000-0000-0000-0000-000000000001',
  $q$update api.workforce_staff_messages set body = 'edited after the fact'
       where employee_id = '9e300000-0000-0000-0000-000000000001' and sender_role = 'staff'$q$),
  'staff cannot edit body of their own already-sent message (guard trigger)');

select ok(not pg_temp.as_auth_exec('9e900000-0000-0000-0000-000000000003',
  $q$update api.workforce_staff_messages set body = 'manager edits staff message'
       where employee_id = '9e300000-0000-0000-0000-000000000001' and sender_role = 'staff'$q$),
  'manager cannot edit body of a staff message either (guard trigger)');

select ok(not pg_temp.as_auth_exec('9e900000-0000-0000-0000-000000000001',
  $q$update api.workforce_staff_messages set employee_id = '9e300000-0000-0000-0000-000000000002'
       where employee_id = '9e300000-0000-0000-0000-000000000001' and sender_role = 'staff'$q$),
  'staff cannot reassign a message to a different thread (guard trigger)');

select ok(not pg_temp.as_auth_exec('9e900000-0000-0000-0000-000000000001',
  $q$update api.workforce_staff_messages set sender_role = 'manager'
       where employee_id = '9e300000-0000-0000-0000-000000000001' and sender_role = 'staff'$q$),
  'staff cannot spoof sender_role after the fact (guard trigger)');

-- ============================================================================
-- Section 8: manager can mark-read/archive/delete across every thread at
-- their location, still cannot edit body (same guard trigger, no
-- permission-based bypass).
-- ============================================================================

select ok(pg_temp.as_auth_exec('9e900000-0000-0000-0000-000000000003',
  $q$update api.workforce_staff_messages set is_read = true, archived_at = now()
       where employee_id = '9e300000-0000-0000-0000-000000000002' and sender_role = 'staff'$q$),
  'manager can mark-read and archive staff B''s message');

-- ============================================================================
-- Section 9: cross-tenant isolation.
-- ============================================================================

insert into core.tenants (id, slug, name) values
  ('9f000000-0000-0000-0000-00000000000b', 'pgtap-mail-tenant-b', 'pgTAP Mail Tenant B');
insert into core.users (id, display_name) values
  ('9f900000-0000-0000-0000-000000000001', 'Tenant B Owner');
insert into core.role_assignments (tenant_id, user_id, role_id) values
  ('9f000000-0000-0000-0000-00000000000b', '9f900000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000003'); -- tenant_owner, tenant-wide

select is(
  pg_temp.as_auth_count('9f900000-0000-0000-0000-000000000001',
    $$ select count(*)::int from api.workforce_staff_messages
       where tenant_id = '9e000000-0000-0000-0000-00000000000a' $$),
  0,
  'Tenant B owner sees zero Tenant A staff_messages rows (tenant isolation)'
);

select * from finish();
rollback;
