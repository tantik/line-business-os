-- ============================================================================
-- DB test: Realtime change signals (migration 0127)
-- ----------------------------------------------------------------------------
-- Run with:  pnpm exec supabase db reset && pnpm exec supabase test db
--
-- Proves:
--   * core.realtime_topic_allowed: Staff joins own tenant's :staff and own
--     :emp topic only; Manager joins :manager and :staff; nobody joins another
--     tenant's or another employee's topic; malformed / anonymous -> false;
--   * the realtime.messages SELECT policy applies those rules, and an
--     authenticated user cannot INSERT (cannot broadcast);
--   * triggers: a published shift signals :staff + :manager, a draft only
--     :manager; Manager mail signals only the employee's :emp topic, Staff
--     mail only :manager; an exchange signals the requester's :emp topic;
--   * payload is exactly {area, location, by} -- no row data;
--   * one signal per topic per transaction even for many rows.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, workforce;

select no_plan();

create function pg_temp.allowed(p_sub text, p_topic text)
returns boolean language plpgsql as $$
declare v boolean;
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('app.current_user_id', '', true);
  perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  set local role authenticated;
  v := core.realtime_topic_allowed(p_topic);
  reset role;
  return v;
end;
$$;

-- Messages on p_topic visible to p_sub through the realtime.messages policy,
-- with realtime.topic() set the way Realtime sets it on channel join.
create function pg_temp.visible(p_sub text, p_topic text)
returns int language plpgsql as $$
declare n int;
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('app.current_user_id', '', true);
  perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  perform set_config('realtime.topic', p_topic, true);
  set local role authenticated;
  select count(*) into n from realtime.messages where topic = p_topic;
  reset role;
  return n;
end;
$$;

create function pg_temp.sent(p_topic text)
returns int language sql as $$
  select count(*)::int from realtime.messages where topic = p_topic;
$$;

create function pg_temp.reset_signals()
returns void language plpgsql as $$
begin
  delete from realtime.messages where topic like 'oruwa:c1270000-%';
  perform set_config('oruwa.rt_sent', '', true);
end;
$$;

-- --- Fixtures ----------------------------------------------------------------
-- Tenant A: Manager M, Staff S (employee E1), other employee E2. Tenant B: EB.
insert into core.tenants (id, slug, name) values
  ('c1270000-0000-0000-0000-00000000000a', 'pgtap-rt-a', 'pgTAP Realtime A'),
  ('c1270000-0000-0000-0000-00000000000b', 'pgtap-rt-b', 'pgTAP Realtime B');
insert into core.tenant_modules (tenant_id, module, is_enabled) values
  ('c1270000-0000-0000-0000-00000000000a', 'workforce', true),
  ('c1270000-0000-0000-0000-00000000000b', 'workforce', true);
insert into core.locations (id, tenant_id, name, timezone) values
  ('c1271000-0000-0000-0000-000000000001', 'c1270000-0000-0000-0000-00000000000a', 'A/L1', 'Asia/Tokyo'),
  ('c1271000-0000-0000-0000-000000000002', 'c1270000-0000-0000-0000-00000000000b', 'B/L1', 'Asia/Tokyo');
insert into core.users (id, display_name) values
  ('c1279000-0000-0000-0000-000000000001', 'RT Manager A'),
  ('c1279000-0000-0000-0000-000000000002', 'RT Staff A'),
  ('c1279000-0000-0000-0000-000000000003', 'RT Staff B');
insert into core.tenant_memberships (tenant_id, user_id, status) values
  ('c1270000-0000-0000-0000-00000000000a', 'c1279000-0000-0000-0000-000000000001', 'active'),
  ('c1270000-0000-0000-0000-00000000000a', 'c1279000-0000-0000-0000-000000000002', 'active'),
  ('c1270000-0000-0000-0000-00000000000b', 'c1279000-0000-0000-0000-000000000003', 'active');
insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('c1270000-0000-0000-0000-00000000000a', 'c1279000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000005', null),
  ('c1270000-0000-0000-0000-00000000000a', 'c1279000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000006', 'c1271000-0000-0000-0000-000000000001'),
  ('c1270000-0000-0000-0000-00000000000b', 'c1279000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000006', 'c1271000-0000-0000-0000-000000000002');
insert into workforce.employees (id, tenant_id, location_id, name_encrypted, is_active, user_id) values
  ('c1273000-0000-0000-0000-000000000001', 'c1270000-0000-0000-0000-00000000000a', 'c1271000-0000-0000-0000-000000000001', '\x00', true, 'c1279000-0000-0000-0000-000000000002'),
  ('c1273000-0000-0000-0000-000000000002', 'c1270000-0000-0000-0000-00000000000a', 'c1271000-0000-0000-0000-000000000001', '\x00', true, null),
  ('c1273000-0000-0000-0000-000000000003', 'c1270000-0000-0000-0000-00000000000b', 'c1271000-0000-0000-0000-000000000002', '\x00', true, 'c1279000-0000-0000-0000-000000000003');
insert into workforce.shift_types (id, tenant_id, location_id, code, label_ja, starts_at_local, ends_at_local, break_minutes, is_active) values
  ('c1274000-0000-0000-0000-000000000001', 'c1270000-0000-0000-0000-00000000000a', 'c1271000-0000-0000-0000-000000000001', 'AM', 'AM', '09:00', '17:00', 60, true);

-- ============================================================================
-- 1. Join rules
-- ============================================================================
select ok(pg_temp.allowed('c1279000-0000-0000-0000-000000000002', 'oruwa:c1270000-0000-0000-0000-00000000000a:staff'), 'Staff joins own tenant :staff');
select ok(not pg_temp.allowed('c1279000-0000-0000-0000-000000000002', 'oruwa:c1270000-0000-0000-0000-00000000000a:manager'), 'Staff cannot join :manager');
select ok(pg_temp.allowed('c1279000-0000-0000-0000-000000000002', 'oruwa:c1270000-0000-0000-0000-00000000000a:emp:c1273000-0000-0000-0000-000000000001'), 'Staff joins own :emp topic');
select ok(not pg_temp.allowed('c1279000-0000-0000-0000-000000000002', 'oruwa:c1270000-0000-0000-0000-00000000000a:emp:c1273000-0000-0000-0000-000000000002'), 'Staff cannot join a coworker''s :emp topic');
select ok(not pg_temp.allowed('c1279000-0000-0000-0000-000000000002', 'oruwa:c1270000-0000-0000-0000-00000000000b:staff'), 'Staff cannot join another tenant''s :staff');
select ok(not pg_temp.allowed('c1279000-0000-0000-0000-000000000003', 'oruwa:c1270000-0000-0000-0000-00000000000a:emp:c1273000-0000-0000-0000-000000000003'), 'own employee id under the wrong tenant is refused');
select ok(pg_temp.allowed('c1279000-0000-0000-0000-000000000001', 'oruwa:c1270000-0000-0000-0000-00000000000a:manager'), 'Manager joins :manager');
select ok(pg_temp.allowed('c1279000-0000-0000-0000-000000000001', 'oruwa:c1270000-0000-0000-0000-00000000000a:staff'), 'Manager joins :staff');
select ok(not pg_temp.allowed('c1279000-0000-0000-0000-000000000001', 'oruwa:c1270000-0000-0000-0000-00000000000b:manager'), 'Manager cannot join another tenant''s :manager');
select ok(not pg_temp.allowed(null, 'oruwa:c1270000-0000-0000-0000-00000000000a:staff'), 'no user -> false');
select ok(not pg_temp.allowed('c1279000-0000-0000-0000-000000000001', 'oruwa:not-a-uuid:manager'), 'malformed tenant -> false');
select ok(not pg_temp.allowed('c1279000-0000-0000-0000-000000000001', 'oruwa:c1270000-0000-0000-0000-00000000000a:manager:extra'), 'extra segments -> false');
select ok(not pg_temp.allowed('c1279000-0000-0000-0000-000000000001', 'other:c1270000-0000-0000-0000-00000000000a:manager'), 'foreign prefix -> false');

-- ============================================================================
-- 2. Shift signals: published -> staff + manager, draft -> manager only
-- ============================================================================
select pg_temp.reset_signals();
insert into workforce.shifts (tenant_id, location_id, employee_id, shift_type_id, starts_at, ends_at, break_minutes, published) values
  ('c1270000-0000-0000-0000-00000000000a', 'c1271000-0000-0000-0000-000000000001', 'c1273000-0000-0000-0000-000000000002', 'c1274000-0000-0000-0000-000000000001',
   '2026-11-05 00:00:00+00', '2026-11-05 08:00:00+00', 60, false);
select is(pg_temp.sent('oruwa:c1270000-0000-0000-0000-00000000000a:manager'), 1, 'draft shift signals :manager');
select is(pg_temp.sent('oruwa:c1270000-0000-0000-0000-00000000000a:staff'), 0, 'draft shift does not signal :staff');

select pg_temp.reset_signals();
update workforce.shifts set published = true where tenant_id = 'c1270000-0000-0000-0000-00000000000a';
select is(pg_temp.sent('oruwa:c1270000-0000-0000-0000-00000000000a:staff'), 1, 'publishing signals :staff');

select is(
  (select array_agg(k order by k) from realtime.messages m, jsonb_object_keys(m.payload) k where m.topic = 'oruwa:c1270000-0000-0000-0000-00000000000a:staff' and k <> 'id'),
  array['area', 'by', 'location'], 'payload carries only area / by / location (+ the message id realtime.send adds) -- no row data');
select is(
  (select payload ->> 'area' from realtime.messages where topic = 'oruwa:c1270000-0000-0000-0000-00000000000a:staff' limit 1),
  'schedule', 'area = schedule');
select ok(
  (select private from realtime.messages where topic = 'oruwa:c1270000-0000-0000-0000-00000000000a:staff' limit 1),
  'signal is sent on a private channel');

-- Many rows, one transaction -> one signal per topic.
select pg_temp.reset_signals();
insert into workforce.shifts (tenant_id, location_id, employee_id, shift_type_id, starts_at, ends_at, break_minutes, published)
select 'c1270000-0000-0000-0000-00000000000a', 'c1271000-0000-0000-0000-000000000001', 'c1273000-0000-0000-0000-000000000002', 'c1274000-0000-0000-0000-000000000001',
       timestamptz '2026-11-10 00:00:00+00' + (d || ' days')::interval, timestamptz '2026-11-10 08:00:00+00' + (d || ' days')::interval, 60, false
  from generate_series(0, 9) d;
select is(pg_temp.sent('oruwa:c1270000-0000-0000-0000-00000000000a:manager'), 1, '10 draft inserts in one transaction -> 1 signal');

-- ============================================================================
-- 3. Mail: Manager-authored -> employee only; Staff-authored -> manager only
-- ============================================================================
select pg_temp.reset_signals();
insert into workforce.staff_messages (tenant_id, location_id, employee_id, sender_role, sender_user_id, body) values
  ('c1270000-0000-0000-0000-00000000000a', 'c1271000-0000-0000-0000-000000000001', 'c1273000-0000-0000-0000-000000000001', 'manager', 'c1279000-0000-0000-0000-000000000001', 'pgTAP manager message');
select is(pg_temp.sent('oruwa:c1270000-0000-0000-0000-00000000000a:emp:c1273000-0000-0000-0000-000000000001'), 1, 'Manager mail signals the employee''s :emp topic');
select is(pg_temp.sent('oruwa:c1270000-0000-0000-0000-00000000000a:manager'), 0, 'Manager mail does not signal :manager');
select is(pg_temp.sent('oruwa:c1270000-0000-0000-0000-00000000000a:staff'), 0, 'mail never goes to the shared :staff topic');

select pg_temp.reset_signals();
insert into workforce.staff_messages (tenant_id, location_id, employee_id, sender_role, sender_user_id, body) values
  ('c1270000-0000-0000-0000-00000000000a', 'c1271000-0000-0000-0000-000000000001', 'c1273000-0000-0000-0000-000000000001', 'staff', 'c1279000-0000-0000-0000-000000000002', 'pgTAP staff message');
select is(pg_temp.sent('oruwa:c1270000-0000-0000-0000-00000000000a:manager'), 1, 'Staff mail signals :manager');
select is(pg_temp.sent('oruwa:c1270000-0000-0000-0000-00000000000a:emp:c1273000-0000-0000-0000-000000000001'), 0, 'Staff mail does not echo to own :emp topic');

-- ============================================================================
-- 4. The receive policy
-- ============================================================================
select pg_temp.reset_signals();
insert into workforce.staff_messages (tenant_id, location_id, employee_id, sender_role, sender_user_id, body) values
  ('c1270000-0000-0000-0000-00000000000a', 'c1271000-0000-0000-0000-000000000001', 'c1273000-0000-0000-0000-000000000001', 'manager', 'c1279000-0000-0000-0000-000000000001', 'pgTAP policy check');
select is(pg_temp.visible('c1279000-0000-0000-0000-000000000002', 'oruwa:c1270000-0000-0000-0000-00000000000a:emp:c1273000-0000-0000-0000-000000000001'), 1,
  'the employee receives their own :emp signal');
select is(pg_temp.visible('c1279000-0000-0000-0000-000000000003', 'oruwa:c1270000-0000-0000-0000-00000000000a:emp:c1273000-0000-0000-0000-000000000001'), 0,
  'another tenant''s user receives nothing on that topic');
select is(pg_temp.visible('c1279000-0000-0000-0000-000000000001', 'oruwa:c1270000-0000-0000-0000-00000000000a:emp:c1273000-0000-0000-0000-000000000001'), 0,
  'even the Manager cannot listen on an employee''s personal topic');

-- Review P2: a row is visible only on its own topic, even if the joined
-- topic itself is allowed.
select pg_temp.reset_signals();
insert into workforce.shifts (tenant_id, location_id, employee_id, shift_type_id, starts_at, ends_at, break_minutes, published) values
  ('c1270000-0000-0000-0000-00000000000b', 'c1271000-0000-0000-0000-000000000002', 'c1273000-0000-0000-0000-000000000003', null,
   '2026-11-06 00:00:00+00', '2026-11-06 08:00:00+00', 0, false);
select is(pg_temp.sent('oruwa:c1270000-0000-0000-0000-00000000000b:manager'), 1, 'tenant B draft signals B :manager');
create function pg_temp.visible_any(p_sub text, p_joined_topic text, p_row_topic text)
returns int language plpgsql as $$
declare n int;
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('app.current_user_id', '', true);
  perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  perform set_config('realtime.topic', p_joined_topic, true);
  set local role authenticated;
  select count(*) into n from realtime.messages where topic = p_row_topic;
  reset role;
  return n;
end;
$$;
select is(pg_temp.visible_any('c1279000-0000-0000-0000-000000000002',
  'oruwa:c1270000-0000-0000-0000-00000000000a:staff', 'oruwa:c1270000-0000-0000-0000-00000000000b:manager'), 0,
  'joined to own allowed topic, a row of another tenant''s topic stays invisible');

select is(
  (select count(*)::int from pg_policies where schemaname = 'realtime' and tablename = 'messages' and policyname = 'oruwa_broadcast_receive' and cmd = 'SELECT'),
  1, 'one SELECT policy oruwa_broadcast_receive');
select is(
  (select count(*)::int from pg_policies where schemaname = 'realtime' and tablename = 'messages' and cmd in ('INSERT', 'ALL') and policyname like 'oruwa%'),
  0, 'no oruwa INSERT policy: browsers cannot broadcast');

-- ============================================================================
-- 5. Exchanges reach the requester; a failing send never breaks the write
-- ============================================================================
select pg_temp.reset_signals();
select lives_ok($q$
  insert into workforce.shift_exchanges (tenant_id, location_id, shift_id, requester_employee_id, status, reason)
  select tenant_id, location_id, id, 'c1273000-0000-0000-0000-000000000001', 'open', 'pgTAP'
    from workforce.shifts where tenant_id = 'c1270000-0000-0000-0000-00000000000a' and published limit 1
$q$, 'exchange insert succeeds');
select is(pg_temp.sent('oruwa:c1270000-0000-0000-0000-00000000000a:emp:c1273000-0000-0000-0000-000000000001'), 1, 'exchange signals the requester''s :emp topic');
select is(pg_temp.sent('oruwa:c1270000-0000-0000-0000-00000000000a:manager'), 1, 'exchange signals :manager');

-- A named replacement gets their own :emp signal too (emp:replacement_employee_id).
select pg_temp.reset_signals();
delete from workforce.shift_exchanges where tenant_id = 'c1270000-0000-0000-0000-00000000000a';
insert into workforce.shift_exchanges (tenant_id, location_id, shift_id, requester_employee_id, replacement_employee_id, status, reason)
select tenant_id, location_id, id, 'c1273000-0000-0000-0000-000000000001', 'c1273000-0000-0000-0000-000000000002', 'open', 'pgTAP'
  from workforce.shifts where tenant_id = 'c1270000-0000-0000-0000-00000000000a' and published limit 1;
select is(pg_temp.sent('oruwa:c1270000-0000-0000-0000-00000000000a:emp:c1273000-0000-0000-0000-000000000002'), 1, 'the named replacement gets an :emp signal');

-- DELETE routes from the old row: deleting a published shift signals :staff.
select pg_temp.reset_signals();
delete from workforce.shift_exchanges where tenant_id = 'c1270000-0000-0000-0000-00000000000a';
delete from workforce.shifts where tenant_id = 'c1270000-0000-0000-0000-00000000000a' and published;
select is(pg_temp.sent('oruwa:c1270000-0000-0000-0000-00000000000a:staff'), 1, 'deleting a published shift signals :staff');

select ok(
  (select prosecdef from pg_proc where oid = 'core.realtime_signal()'::regprocedure)
  and (select prosecdef from pg_proc where oid = 'core.realtime_topic_allowed(text)'::regprocedure),
  'both functions are SECURITY DEFINER');
select ok(
  not has_function_privilege('anon', 'core.realtime_topic_allowed(text)', 'execute'),
  'anon cannot execute core.realtime_topic_allowed');

select * from finish();
rollback;
