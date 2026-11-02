-- ============================================================================
-- DB test: migration 0147 (purchase receipts, DEBT-136).
-- Run with:  supabase db reset && supabase test db
--   A  grants / ADR 0008 / anon refused / no direct table writes
--   B  create: own items, item rules, amount-or-photo, category+note without items,
--      photo path, date window, foreign location / tenant, module off, settings
--   C  visibility: buyer own only, other staff none, manager + owner all, other tenant none
--   D  edit window, manager edits later, cancel (reason, items freed), canceled is final
--   E  audit rows
--   F  settings: manager only, readable by staff
--   G  photo storage: own folder only; manager reads, other staff do not
-- ============================================================================
begin;

create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core;

select no_plan();

create function pg_temp.as_user(p_uid text, p_sql text) returns text language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_uid, true);
  set local role authenticated;
  execute p_sql into v;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  return v;
-- purchases_module_disabled uses P0004 (= assert_failure), which OTHERS does not catch
exception when assert_failure then
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  return 'ERR ' || sqlstate || ' ' || sqlerrm;
when others then
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  return 'ERR ' || sqlstate || ' ' || sqlerrm;
end $$;

-- fixtures: T1 (L1, L2), T2 (L3). O owner T1, M manager T1/L1, E and F employees T1/L1,
-- X manager of T2. Actions at L1: a1 bought by E, a2 bought by F, a3 received by E,
-- a4 ordered by E (not linkable); at L2: a5 bought by O.
insert into core.tenants (id, slug, name) values
  ('a8600000-0000-0000-0000-0000000000a1', 'pgtap-0147-t1', 'pgTAP 0147 T1'),
  ('a8600000-0000-0000-0000-0000000000a2', 'pgtap-0147-t2', 'pgTAP 0147 T2');
insert into core.tenant_modules (tenant_id, module, is_enabled)
select t, m::core.module_code, true
  from unnest(array['a8600000-0000-0000-0000-0000000000a1', 'a8600000-0000-0000-0000-0000000000a2']::uuid[]) t,
       unnest(array['workforce', 'inventory', 'purchases']) m;
insert into core.locations (id, tenant_id, name, timezone) values
  ('a8610000-0000-0000-0000-000000000001', 'a8600000-0000-0000-0000-0000000000a1', 'T1 / L1', 'Asia/Tokyo'),
  ('a8610000-0000-0000-0000-000000000002', 'a8600000-0000-0000-0000-0000000000a1', 'T1 / L2', 'Asia/Tokyo'),
  ('a8610000-0000-0000-0000-000000000003', 'a8600000-0000-0000-0000-0000000000a2', 'T2 / L3', 'Asia/Tokyo');
insert into core.users (id, display_name) values
  ('a8690000-0000-0000-0000-000000000001', 'O'), ('a8690000-0000-0000-0000-000000000002', 'M'),
  ('a8690000-0000-0000-0000-000000000003', 'E'), ('a8690000-0000-0000-0000-000000000004', 'F'),
  ('a8690000-0000-0000-0000-000000000005', 'X');
insert into core.tenant_memberships (tenant_id, user_id, status) values
  ('a8600000-0000-0000-0000-0000000000a1', 'a8690000-0000-0000-0000-000000000001', 'active'),
  ('a8600000-0000-0000-0000-0000000000a1', 'a8690000-0000-0000-0000-000000000002', 'active'),
  ('a8600000-0000-0000-0000-0000000000a1', 'a8690000-0000-0000-0000-000000000003', 'active'),
  ('a8600000-0000-0000-0000-0000000000a1', 'a8690000-0000-0000-0000-000000000004', 'active'),
  ('a8600000-0000-0000-0000-0000000000a2', 'a8690000-0000-0000-0000-000000000005', 'active');
insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('a8600000-0000-0000-0000-0000000000a1', 'a8690000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', null),
  ('a8600000-0000-0000-0000-0000000000a1', 'a8690000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000005', 'a8610000-0000-0000-0000-000000000001'),
  ('a8600000-0000-0000-0000-0000000000a1', 'a8690000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000006', 'a8610000-0000-0000-0000-000000000001'),
  ('a8600000-0000-0000-0000-0000000000a1', 'a8690000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000006', 'a8610000-0000-0000-0000-000000000001'),
  ('a8600000-0000-0000-0000-0000000000a2', 'a8690000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000005', null);
insert into workforce.employees (id, tenant_id, location_id, user_id, name_encrypted) values
  ('a8630000-0000-0000-0000-000000000003', 'a8600000-0000-0000-0000-0000000000a1', 'a8610000-0000-0000-0000-000000000001', 'a8690000-0000-0000-0000-000000000003', '\x03');
insert into inventory.items (id, tenant_id, location_id, name, unit, required_quantity, reorder_point) values
  ('a86a0000-0000-0000-0000-000000000001', 'a8600000-0000-0000-0000-0000000000a1', 'a8610000-0000-0000-0000-000000000001', 'Milk', 'L', 10, 3),
  ('a86a0000-0000-0000-0000-000000000002', 'a8600000-0000-0000-0000-0000000000a1', 'a8610000-0000-0000-0000-000000000002', 'Beans', 'kg', 10, 3);
insert into inventory.stock_counts (id, tenant_id, location_id, item_id, actual_quantity, counted_by) values
  ('a86b0000-0000-0000-0000-000000000001', 'a8600000-0000-0000-0000-0000000000a1', 'a8610000-0000-0000-0000-000000000001', 'a86a0000-0000-0000-0000-000000000001', 1, 'a8690000-0000-0000-0000-000000000003'),
  ('a86b0000-0000-0000-0000-000000000002', 'a8600000-0000-0000-0000-0000000000a1', 'a8610000-0000-0000-0000-000000000002', 'a86a0000-0000-0000-0000-000000000002', 1, 'a8690000-0000-0000-0000-000000000001');
insert into purchases.purchase_actions (id, tenant_id, location_id, item_id, snapshot_stock_count_id, actioned_by, action_type, ordered_quantity, received_quantity) values
  ('a86c0000-0000-0000-0000-000000000001', 'a8600000-0000-0000-0000-0000000000a1', 'a8610000-0000-0000-0000-000000000001', 'a86a0000-0000-0000-0000-000000000001', 'a86b0000-0000-0000-0000-000000000001', 'a8690000-0000-0000-0000-000000000003', 'bought', null, null),
  ('a86c0000-0000-0000-0000-000000000002', 'a8600000-0000-0000-0000-0000000000a1', 'a8610000-0000-0000-0000-000000000001', 'a86a0000-0000-0000-0000-000000000001', 'a86b0000-0000-0000-0000-000000000001', 'a8690000-0000-0000-0000-000000000004', 'bought', null, null),
  ('a86c0000-0000-0000-0000-000000000003', 'a8600000-0000-0000-0000-0000000000a1', 'a8610000-0000-0000-0000-000000000001', 'a86a0000-0000-0000-0000-000000000001', 'a86b0000-0000-0000-0000-000000000001', 'a8690000-0000-0000-0000-000000000003', 'received', null, 2),
  ('a86c0000-0000-0000-0000-000000000004', 'a8600000-0000-0000-0000-0000000000a1', 'a8610000-0000-0000-0000-000000000001', 'a86a0000-0000-0000-0000-000000000001', 'a86b0000-0000-0000-0000-000000000001', 'a8690000-0000-0000-0000-000000000003', 'ordered', 3, null),
  ('a86c0000-0000-0000-0000-000000000005', 'a8600000-0000-0000-0000-0000000000a1', 'a8610000-0000-0000-0000-000000000002', 'a86a0000-0000-0000-0000-000000000002', 'a86b0000-0000-0000-0000-000000000002', 'a8690000-0000-0000-0000-000000000001', 'bought', null, null);

-- create a receipt at T1/L1 (today) and return its id or 'ERR ...'
create function pg_temp.create(p_uid text, p_amount text, p_category text, p_note text, p_media text, p_actions text,
  p_location text default 'a8610000-0000-0000-0000-000000000001', p_tenant text default 'a8600000-0000-0000-0000-0000000000a1',
  p_date text default null) returns text language sql as $$
  select pg_temp.as_user(p_uid, format(
    'select api.create_spend_receipt(%L::uuid, %L::uuid, %s, %s, %L, %L, %L, %L::uuid[])::text',
    p_tenant, p_location,
    coalesce(quote_literal(p_date) || '::date', format('(purchases.location_today(%L::uuid, %L::uuid))', p_tenant, p_location)),
    coalesce(p_amount, 'null'), p_category, p_note, p_media, p_actions));
$$;
-- location_today is not granted to authenticated; the helper above evaluates it in the
-- caller's role, so give the test role temporary access
grant execute on function purchases.location_today(uuid, uuid) to authenticated;

create function pg_temp.photo(p_uid text) returns text language sql as $$
  select 'a8600000-0000-0000-0000-0000000000a1/a8610000-0000-0000-0000-000000000001/' || p_uid || '/a86d0000-0000-0000-0000-000000000001.jpg';
$$;

-- A: grants ------------------------------------------------------------------------------------
select is(has_function_privilege('anon', 'api.create_spend_receipt(uuid, uuid, date, integer, text, text, text, uuid[])', 'execute'), false, 'A: anon cannot create');
select is(has_table_privilege('anon', 'api.spend_receipts', 'select'), false, 'A: anon cannot read api.spend_receipts');
select is(has_table_privilege('authenticated', 'purchases.spend_receipts', 'insert'), false, 'A: no direct INSERT on spend_receipts');
select is(has_table_privilege('authenticated', 'purchases.spend_receipts', 'update'), false, 'A: no direct UPDATE on spend_receipts');
select is(has_table_privilege('authenticated', 'purchases.spend_receipt_items', 'insert'), false, 'A: no direct INSERT on spend_receipt_items');
select is((select prosecdef from pg_proc where oid = 'api.create_spend_receipt(uuid, uuid, date, integer, text, text, text, uuid[])'::regprocedure), false, 'A: api.create_spend_receipt is SECURITY INVOKER (ADR 0008)');
select is((select count(*)::int from pg_proc where pronamespace = 'api'::regnamespace and proname like '%spend_receipt%' and prosecdef), 0, 'A: no SECURITY DEFINER in api for receipts');

-- B: create --------------------------------------------------------------------------------------
create temp table ids (k text primary key, v text);
grant all on ids to authenticated;
insert into ids values ('r1', pg_temp.create('a8690000-0000-0000-0000-000000000003', '1280', null, null, null,
  '{a86c0000-0000-0000-0000-000000000001,a86c0000-0000-0000-0000-000000000003}'));
select ok((select v from ids where k = 'r1') ~ '^[0-9a-f-]{36}$', 'B: employee creates a receipt for own bought + received items');
select is(left(pg_temp.create('a8690000-0000-0000-0000-000000000003', '100', null, null, null, '{a86c0000-0000-0000-0000-000000000002}'), 9), 'ERR 42501',
  'B: employee cannot link another employee''s purchase');
select is(left(pg_temp.create('a8690000-0000-0000-0000-000000000003', '100', null, null, null, '{a86c0000-0000-0000-0000-000000000004}'), 9), 'ERR 42501',
  'B: an ordered (not bought/received) action cannot be linked');
select is(left(pg_temp.create('a8690000-0000-0000-0000-000000000003', '100', null, null, null, '{a86c0000-0000-0000-0000-000000000001}'), 9), 'ERR 42501',
  'B: an action already on a receipt cannot be linked again');
select is(left(pg_temp.create('a8690000-0000-0000-0000-000000000003', '100', null, null, null, '{a86c0000-0000-0000-0000-000000000005}'), 9), 'ERR 42501',
  'B: an action of another location cannot be linked');
select is(left(pg_temp.create('a8690000-0000-0000-0000-000000000003', '500', null, null, null, '{}'), 9), 'ERR 22023',
  'B: no items -> category and note required');
insert into ids values ('r2', pg_temp.create('a8690000-0000-0000-0000-000000000003', '500', 'supplies', '洗剤', null, '{}'));
select ok((select v from ids where k = 'r2') ~ '^[0-9a-f-]{36}$', 'B: no items with category + note is allowed');
select is(left(pg_temp.create('a8690000-0000-0000-0000-000000000003', null, 'other', 'x', null, '{}'), 9), 'ERR 22023',
  'B: neither amount nor photo -> refused');
insert into ids values ('r3', pg_temp.create('a8690000-0000-0000-0000-000000000004', null, null, null, pg_temp.photo('a8690000-0000-0000-0000-000000000004'), '{a86c0000-0000-0000-0000-000000000002}'));
select ok((select v from ids where k = 'r3') ~ '^[0-9a-f-]{36}$', 'B: photo without amount is allowed (a Manager adds the amount later)');
select is(left(pg_temp.create('a8690000-0000-0000-0000-000000000003', null, 'other', 'x', pg_temp.photo('a8690000-0000-0000-0000-000000000004'), '{}'), 9), 'ERR 22023',
  'B: a photo in another user''s folder is refused');
select is(left(pg_temp.create('a8690000-0000-0000-0000-000000000003', null, 'other', 'x', 'a8600000-0000-0000-0000-0000000000a2/a8610000-0000-0000-0000-000000000003/a8690000-0000-0000-0000-000000000003/a86d0000-0000-0000-0000-000000000001.jpg', '{}'), 9), 'ERR 22023',
  'B: a photo path of another tenant is refused');
select is(left(pg_temp.create('a8690000-0000-0000-0000-000000000003', '100', 'other', 'x', null, '{}', p_date => (current_date + 5)::text), 9), 'ERR 22023',
  'B: a future date is refused');
select is(left(pg_temp.create('a8690000-0000-0000-0000-000000000003', '100', 'other', 'x', null, '{}', p_date => (current_date - 120)::text), 9), 'ERR 22023',
  'B: a date older than 90 days is refused');
select is(left(pg_temp.create('a8690000-0000-0000-0000-000000000001', '100', 'other', 'x', null, '{}', p_location => 'a8610000-0000-0000-0000-000000000003', p_date => current_date::text), 9), 'ERR 22023',
  'B: an Owner (tenant-wide role) cannot write to a location of another tenant');
select is(left(pg_temp.create('a8690000-0000-0000-0000-000000000005', '100', 'other', 'x', null, '{}'), 9), 'ERR 42501',
  'B: a manager of another tenant cannot create in T1');
select is(left(pg_temp.create('a8690000-0000-0000-0000-000000000003', '100', 'other', 'x', null, '{}', p_location => 'a8610000-0000-0000-0000-000000000002'), 9), 'ERR 42501',
  'B: an L1 employee cannot create at L2');
update core.tenant_modules set is_enabled = false where tenant_id = 'a8600000-0000-0000-0000-0000000000a1' and module = 'purchases';
select is(left(pg_temp.create('a8690000-0000-0000-0000-000000000003', '100', 'other', 'x', null, '{}', p_date => current_date::text), 9), 'ERR P0004',
  'B: purchases module off -> refused');
update core.tenant_modules set is_enabled = true where tenant_id = 'a8600000-0000-0000-0000-0000000000a1' and module = 'purchases';

-- C: visibility ----------------------------------------------------------------------------------
create function pg_temp.seen(p_uid text) returns text language sql as $$
  select pg_temp.as_user(p_uid, 'select count(*)::text from api.spend_receipts');
$$;
select is(pg_temp.seen('a8690000-0000-0000-0000-000000000003'), '2', 'C: the buyer sees their own 2 receipts');
select is(pg_temp.seen('a8690000-0000-0000-0000-000000000004'), '1', 'C: another employee sees only their own');
select is(pg_temp.seen('a8690000-0000-0000-0000-000000000002'), '3', 'C: the Manager of L1 sees every receipt of L1');
select is(pg_temp.seen('a8690000-0000-0000-0000-000000000001'), '3', 'C: the Owner sees every receipt');
select is(pg_temp.seen('a8690000-0000-0000-0000-000000000005'), '0', 'C: a manager of another tenant sees none');
select is(pg_temp.as_user('a8690000-0000-0000-0000-000000000004', 'select count(*)::text from purchases.spend_receipt_items'), '1',
  'C: link rows follow receipt visibility');
select is(pg_temp.as_user('a8690000-0000-0000-0000-000000000003',
  format('select jsonb_array_length(items)::text || '':'' || is_mine::text || '':'' || coalesce(created_by_employee_id::text, ''-'') from api.spend_receipts where receipt_id = %L', (select v from ids where k = 'r1'))),
  '2:true:a8630000-0000-0000-0000-000000000003', 'C: the view returns the linked items, is_mine and the buyer''s employee id');

-- D: edit window / manager / cancel ------------------------------------------------------------
create function pg_temp.update(p_uid text, p_key text, p_amount text, p_actions text) returns text language sql as $$
  select pg_temp.as_user(p_uid, format(
    'select api.update_spend_receipt(%L::uuid, %L::uuid, current_date, %s, null, null, null, %L::uuid[])::text',
    'a8600000-0000-0000-0000-0000000000a1', (select v from ids where k = p_key), p_amount, p_actions));
$$;
select is(coalesce(pg_temp.update('a8690000-0000-0000-0000-000000000003', 'r1', '1300', '{a86c0000-0000-0000-0000-000000000001}'), 'ok'), 'ok',
  'D: the buyer edits the receipt on the same day (and unlinks one item)');
select is((select amount_jpy from purchases.spend_receipts where id = (select v from ids where k = 'r1')::uuid), 1300, 'D: ... the amount changed');
select is((select count(*)::int from purchases.spend_receipt_items where receipt_id = (select v from ids where k = 'r1')::uuid), 1, 'D: ... and one item stays linked');
select is(left(pg_temp.update('a8690000-0000-0000-0000-000000000004', 'r1', '1', '{a86c0000-0000-0000-0000-000000000001}'), 9), 'ERR P0002',
  'D: another employee cannot edit it (looks not found)');
update purchases.spend_receipts set created_on = created_on - 1 where id = (select v from ids where k = 'r1')::uuid;
select is(left(pg_temp.update('a8690000-0000-0000-0000-000000000003', 'r1', '1400', '{a86c0000-0000-0000-0000-000000000001}'), 9), 'ERR P0012',
  'D: after the day the buyer can no longer edit');
select is(coalesce(pg_temp.update('a8690000-0000-0000-0000-000000000002', 'r3', '2480', '{a86c0000-0000-0000-0000-000000000002}'), 'ok'), 'ok',
  'D: the Manager adds the missing amount to a photo-only receipt');
select is(coalesce(pg_temp.update('a8690000-0000-0000-0000-000000000002', 'r1', '1400', '{a86c0000-0000-0000-0000-000000000001}'), 'ok'), 'ok',
  'D: the Manager edits after the day');
select is(left(pg_temp.as_user('a8690000-0000-0000-0000-000000000002', format('select api.cancel_spend_receipt(%L, %L, %L)::text',
  'a8600000-0000-0000-0000-0000000000a1', (select v from ids where k = 'r1'), ' ')), 9), 'ERR 22023', 'D: cancel needs a reason');
select is(coalesce(pg_temp.as_user('a8690000-0000-0000-0000-000000000002', format('select api.cancel_spend_receipt(%L, %L, %L)::text',
  'a8600000-0000-0000-0000-0000000000a1', (select v from ids where k = 'r1'), '二重登録')), 'ok'), 'ok', 'D: the Manager cancels with a reason');
select is((select status || ':' || cancel_reason from purchases.spend_receipts where id = (select v from ids where k = 'r1')::uuid), 'canceled:二重登録',
  'D: ... the row stays, canceled with its reason');
select is((select count(*)::int from purchases.spend_receipt_items where receipt_id = (select v from ids where k = 'r1')::uuid), 0,
  'D: ... and its purchases are free for another receipt');
select is(left(pg_temp.update('a8690000-0000-0000-0000-000000000002', 'r1', '1', '{}'), 9), 'ERR P0013', 'D: a canceled receipt cannot be edited');
insert into ids values ('r4', pg_temp.create('a8690000-0000-0000-0000-000000000003', '700', null, null, null, '{a86c0000-0000-0000-0000-000000000001}'));
select ok((select v from ids where k = 'r4') ~ '^[0-9a-f-]{36}$', 'D: the freed purchase can go on a new receipt');

-- E: audit ---------------------------------------------------------------------------------------
-- one transaction -> equal created_at; compare the set of actions
select is((select string_agg(action, ',' order by action) from audit.audit_logs
            where entity = 'spend_receipt' and entity_id = (select v from ids where k = 'r1')),
  'cancel,create,update,update', 'E: create, both updates and the cancel are audited');
select is((select after ->> 'amount_jpy' from audit.audit_logs
            where entity = 'spend_receipt' and entity_id = (select v from ids where k = 'r3') and action = 'update'),
  '2480', 'E: the audit row holds the new amount');

-- F: settings ------------------------------------------------------------------------------------
select is(left(pg_temp.as_user('a8690000-0000-0000-0000-000000000003', $$select api.set_spend_receipt_settings('a8600000-0000-0000-0000-0000000000a1', 'a8610000-0000-0000-0000-000000000001', true, 'required')::text$$), 9),
  'ERR 42501', 'F: an employee cannot change settings');
select is(coalesce(pg_temp.as_user('a8690000-0000-0000-0000-000000000002', $$select api.set_spend_receipt_settings('a8600000-0000-0000-0000-0000000000a1', 'a8610000-0000-0000-0000-000000000001', true, 'required')::text$$), 'ok'),
  'ok', 'F: the Manager sets photo = required');
select is(pg_temp.as_user('a8690000-0000-0000-0000-000000000003', 'select photo_mode from api.spend_receipt_settings'), 'required', 'F: the employee reads the setting');
select is(left(pg_temp.create('a8690000-0000-0000-0000-000000000003', '100', 'other', 'x', null, '{}'), 9), 'ERR P0011', 'F: photo required -> a receipt without photo is refused');
select is(coalesce(pg_temp.as_user('a8690000-0000-0000-0000-000000000002', $$select api.set_spend_receipt_settings('a8600000-0000-0000-0000-0000000000a1', 'a8610000-0000-0000-0000-000000000001', true, 'off')::text$$), 'ok'), 'ok', 'F: photo off');
select is(left(pg_temp.create('a8690000-0000-0000-0000-000000000003', '100', 'other', 'x', pg_temp.photo('a8690000-0000-0000-0000-000000000003'), '{}'), 9), 'ERR P0011', 'F: photo off -> a photo is refused');
select is(coalesce(pg_temp.as_user('a8690000-0000-0000-0000-000000000002', $$select api.set_spend_receipt_settings('a8600000-0000-0000-0000-0000000000a1', 'a8610000-0000-0000-0000-000000000001', false, 'optional')::text$$), 'ok'), 'ok', 'F: receipts off');
select is(left(pg_temp.create('a8690000-0000-0000-0000-000000000003', '100', 'other', 'x', null, '{}'), 9), 'ERR P0010', 'F: receipts off -> refused');
select is((select count(*)::int from audit.audit_logs where entity = 'spend_receipt_settings'), 3, 'F: every settings change is audited');

-- G: photo storage ---------------------------------------------------------------------------------
select is(coalesce(pg_temp.as_user('a8690000-0000-0000-0000-000000000003', format(
  $$insert into storage.objects (bucket_id, name) values ('purchase-receipts', %L) returning 'ok'$$, pg_temp.photo('a8690000-0000-0000-0000-000000000003'))), 'x'),
  'ok', 'G: the employee uploads into their own folder');
select is(left(pg_temp.as_user('a8690000-0000-0000-0000-000000000003', format(
  $$insert into storage.objects (bucket_id, name) values ('purchase-receipts', %L) returning 'ok'$$,
  replace(pg_temp.photo('a8690000-0000-0000-0000-000000000004'), '0001.jpg', '0002.jpg'))), 9),
  'ERR 42501', 'G: ... but not into another user''s folder');
select is(pg_temp.as_user('a8690000-0000-0000-0000-000000000002', $$select count(*)::text from storage.objects where bucket_id = 'purchase-receipts'$$), '1',
  'G: the Manager reads the employee''s photo');
select is(pg_temp.as_user('a8690000-0000-0000-0000-000000000004', $$select count(*)::text from storage.objects where bucket_id = 'purchase-receipts'$$), '0',
  'G: another employee does not');
select is(pg_temp.as_user('a8690000-0000-0000-0000-000000000005', $$select count(*)::text from storage.objects where bucket_id = 'purchase-receipts'$$), '0',
  'G: another tenant does not');

select * from finish();
rollback;
