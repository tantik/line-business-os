-- ============================================================================
-- DB test: migration 0149 (tenant purge reaches rows the cascade cannot,
-- DEBT-103 c; Cloud DEV mame-to-cha failed with 23503 on stock_counts).
-- Run with:  pnpm exec supabase db reset && pnpm exec supabase test db
--   A  dry run counts the uncascaded tables
--   B  real run on archived tenant R with inventory items, stock counts,
--      purchase actions (-> stock counts, so two passes are needed) and a
--      recipe with an ingredient: succeeds, nothing of R left
--   C  tenant S (live, same shape) untouched
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, audit;

select no_plan();

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

-- fixtures ------------------------------------------------------------------------------------
insert into core.users (id, display_name) values ('b1690000-0000-0000-0000-000000000001', 'counter');
insert into auth.users (id, aud, role, email)
values ('b1690000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'pgtap-0149-01@example.invalid');

insert into core.tenants (id, slug, name, kind, status) values
  ('b1600000-0000-0000-0000-0000000000a0', 'pgtap-0149-r', 'pgTAP 0149 R', 'client', 'archived'),
  ('b1600000-0000-0000-0000-0000000000b0', 'pgtap-0149-s', 'pgTAP 0149 S', 'client', 'active');
insert into core.locations (id, tenant_id, name) values
  ('b1610000-0000-0000-0000-0000000000a1', 'b1600000-0000-0000-0000-0000000000a0', 'R / L1'),
  ('b1610000-0000-0000-0000-0000000000b1', 'b1600000-0000-0000-0000-0000000000b0', 'S / L1');
-- S keeps the counter as a member, so the user is no orphan of R
insert into core.tenant_memberships (tenant_id, user_id, status) values
  ('b1600000-0000-0000-0000-0000000000b0', 'b1690000-0000-0000-0000-000000000001', 'active');

insert into inventory.items (id, tenant_id, location_id, name, unit) values
  ('b1620000-0000-0000-0000-0000000000a1', 'b1600000-0000-0000-0000-0000000000a0', 'b1610000-0000-0000-0000-0000000000a1', '牛乳', 'L'),
  ('b1620000-0000-0000-0000-0000000000b1', 'b1600000-0000-0000-0000-0000000000b0', 'b1610000-0000-0000-0000-0000000000b1', '牛乳', 'L');
insert into inventory.stock_counts (id, tenant_id, location_id, item_id, actual_quantity, counted_by) values
  ('b1630000-0000-0000-0000-0000000000a1', 'b1600000-0000-0000-0000-0000000000a0', 'b1610000-0000-0000-0000-0000000000a1', 'b1620000-0000-0000-0000-0000000000a1', 2, 'b1690000-0000-0000-0000-000000000001'),
  ('b1630000-0000-0000-0000-0000000000a2', 'b1600000-0000-0000-0000-0000000000a0', 'b1610000-0000-0000-0000-0000000000a1', 'b1620000-0000-0000-0000-0000000000a1', 3, 'b1690000-0000-0000-0000-000000000001'),
  ('b1630000-0000-0000-0000-0000000000b1', 'b1600000-0000-0000-0000-0000000000b0', 'b1610000-0000-0000-0000-0000000000b1', 'b1620000-0000-0000-0000-0000000000b1', 1, 'b1690000-0000-0000-0000-000000000001');
insert into purchases.purchase_actions (tenant_id, location_id, item_id, snapshot_stock_count_id, actioned_by) values
  ('b1600000-0000-0000-0000-0000000000a0', 'b1610000-0000-0000-0000-0000000000a1', 'b1620000-0000-0000-0000-0000000000a1', 'b1630000-0000-0000-0000-0000000000a2', 'b1690000-0000-0000-0000-000000000001'),
  ('b1600000-0000-0000-0000-0000000000b0', 'b1610000-0000-0000-0000-0000000000b1', 'b1620000-0000-0000-0000-0000000000b1', 'b1630000-0000-0000-0000-0000000000b1', 'b1690000-0000-0000-0000-000000000001');
insert into workforce.recipes (id, tenant_id, location_id, title_ja) values
  ('b1640000-0000-0000-0000-0000000000a1', 'b1600000-0000-0000-0000-0000000000a0', 'b1610000-0000-0000-0000-0000000000a1', 'ラテ');
insert into workforce.recipe_ingredients (tenant_id, recipe_id, label_ja) values
  ('b1600000-0000-0000-0000-0000000000a0', 'b1640000-0000-0000-0000-0000000000a1', '牛乳');

create function pg_temp.s_snapshot() returns text language sql as $$
  select concat_ws(',',
    (select count(*) from core.locations where tenant_id = 'b1600000-0000-0000-0000-0000000000b0'),
    (select count(*) from inventory.items where tenant_id = 'b1600000-0000-0000-0000-0000000000b0'),
    (select count(*) from inventory.stock_counts where tenant_id = 'b1600000-0000-0000-0000-0000000000b0'),
    (select count(*) from purchases.purchase_actions where tenant_id = 'b1600000-0000-0000-0000-0000000000b0'),
    (select count(*) from core.tenant_memberships where tenant_id = 'b1600000-0000-0000-0000-0000000000b0'));
$$;
create temp table res (label text primary key, r jsonb);
create temp table snap (label text primary key, v text);
insert into snap values ('s_before', pg_temp.s_snapshot());

-- A: dry run -----------------------------------------------------------------------------------
insert into res select 'dry', pg_temp.svc($$ select core.purge_tenant('b1600000-0000-0000-0000-0000000000a0', 'pgtap-0149-r') $$);
select is((select r -> 'row_counts' ->> 'inventory.stock_counts' from res where label = 'dry'), '2', 'A: dry run counts stock_counts');
select is((select r -> 'row_counts' ->> 'purchases.purchase_actions' from res where label = 'dry'), '1', 'A: dry run counts purchase_actions');
select is((select r -> 'row_counts' ->> 'workforce.recipe_ingredients' from res where label = 'dry'), '1', 'A: dry run counts recipe_ingredients');
select ok((select r -> 'uncascaded_tables' from res where label = 'dry')
          @> '["inventory.stock_counts", "purchases.purchase_actions", "purchases.spend_receipt_items", "workforce.recipe_ingredients"]'::jsonb,
  'A: dry run lists the tables deleted before the cascade');
select ok(not ((select r -> 'uncascaded_tables' from res where label = 'dry')
               ?| array['core.tenant_provisioning', 'audit.tenant_purge_log', 'audit.audit_logs', 'core.events', 'core.locations']),
  'A: provisioning, tombstones, audit, events and cascaded tables are not in that list');

-- A2: a blocker that never clears -> purge_blocked, nothing written ------------------------------
-- (a cascaded table with a NO ACTION FK into stock_counts; real table, the test rolls back)
create table public.pgtap_0149_blocker (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  stock_count_id uuid not null,
  foreign key (tenant_id, stock_count_id) references inventory.stock_counts(tenant_id, id));
insert into public.pgtap_0149_blocker (tenant_id, stock_count_id)
values ('b1600000-0000-0000-0000-0000000000a0', 'b1630000-0000-0000-0000-0000000000a1');
select is(pg_temp.svc_err($$ select core.purge_tenant('b1600000-0000-0000-0000-0000000000a0', 'pgtap-0149-r', false, false) $$),
  'P0001 purge_blocked: inventory.stock_counts', 'A2: a permanently blocked table stops the purge and is named');
select is((select count(*)::int from audit.tenant_purge_log where tenant_id = 'b1600000-0000-0000-0000-0000000000a0'), 0, 'A2: no tombstone after the refusal');
select is((select count(*)::int from inventory.stock_counts where tenant_id = 'b1600000-0000-0000-0000-0000000000a0'), 2, 'A2: rows rolled back');
drop table public.pgtap_0149_blocker;

-- B: real run ----------------------------------------------------------------------------------
insert into res select 'real', pg_temp.svc($$ select core.purge_tenant('b1600000-0000-0000-0000-0000000000a0', 'pgtap-0149-r', false, false) $$);
select is((select (r ->> 'dry_run')::boolean from res where label = 'real'), false, 'B: real run succeeded');
select is((select r -> 'row_counts' from res where label = 'real'), (select r -> 'row_counts' from res where label = 'dry'), 'B: same row counts as the dry run');
select is((select count(*)::int from core.tenants where id = 'b1600000-0000-0000-0000-0000000000a0'), 0, 'B: tenant gone');
select is((select count(*)::int from inventory.stock_counts where tenant_id = 'b1600000-0000-0000-0000-0000000000a0'), 0, 'B: stock counts gone');
select is((select count(*)::int from purchases.purchase_actions where tenant_id = 'b1600000-0000-0000-0000-0000000000a0'), 0, 'B: purchase actions gone');
select is((select count(*)::int from inventory.items where tenant_id = 'b1600000-0000-0000-0000-0000000000a0'), 0, 'B: items gone');
select is((select count(*)::int from workforce.recipe_ingredients where tenant_id = 'b1600000-0000-0000-0000-0000000000a0'), 0, 'B: recipe ingredients gone');
select is((select count(*)::int from audit.tenant_purge_log where tenant_id = 'b1600000-0000-0000-0000-0000000000a0'), 1, 'B: one tombstone');

-- C: the live tenant ---------------------------------------------------------------------------
select is(pg_temp.s_snapshot(), (select v from snap where label = 's_before'), 'C: tenant S untouched');
select is((select count(*)::int from core.users where id = 'b1690000-0000-0000-0000-000000000001'), 1, 'C: the S member is kept');

select * from finish();
rollback;
