-- ============================================================================
-- DB test: migrations 0130/0131 (Purchasing and Recipes as their own modules).
-- Run with:  pnpm exec supabase db reset && pnpm exec supabase test db
--   A  registry rows, the purchases -> inventory dependency, cafe package
--   B  every moved gate references the new module and no longer the old one
--      (24 policies via pg_get_expr, 5 functions via pg_get_functiondef)
--   C  behaviour on a non-managed tenant with a Manager:
--      recipes OFF + workforce ON, purchases OFF + inventory ON, both ON,
--      inventory OFF + purchases ON
--   D  a package-managed cafe tenant gets purchases + recipes; an override
--      purchases=false disables only purchases
-- ============================================================================
begin;

create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, audit, workforce, inventory, purchases;

select no_plan();

-- --- Helpers ------------------------------------------------------------------
create function pg_temp.as_auth_count(p_sub text, p_sql text) returns int language plpgsql as $$
declare n int;
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('app.current_user_id', '', true);
  perform set_config('request.jwt.claim.sub', p_sub, true);
  set local role authenticated;
  execute p_sql into n;
  reset role;
  return n;
end $$;

create function pg_temp.as_auth_jsonb(p_sub text, p_sql text) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('app.current_user_id', '', true);
  perform set_config('request.jwt.claim.sub', p_sub, true);
  set local role authenticated;
  execute p_sql into v;
  reset role;
  return v;
end $$;

-- 'ok' when the statement ran, else its SQLSTATE. P0004 is ASSERT_FAILURE in
-- PL/pgSQL, which WHEN OTHERS does not catch, so it is caught explicitly.
create function pg_temp.as_auth_sqlstate(p_sub text, p_sql text) returns text language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('app.current_user_id', '', true);
  perform set_config('request.jwt.claim.sub', p_sub, true);
  set local role authenticated;
  execute p_sql;
  reset role;
  return 'ok';
exception
  when assert_failure then
    reset role;
    return 'P0004';
  when others then
    reset role;
    return sqlstate;
end $$;

create function pg_temp.as_service(p_sql text) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  set local role service_role;
  execute p_sql into v;
  reset role;
  return v;
end $$;

create function pg_temp.set_module(p_tenant uuid, p_module core.module_code, p_on boolean) returns void language sql as $$
  update core.tenant_modules set is_enabled = p_on where tenant_id = p_tenant and module = p_module;
$$;

create function pg_temp.enabled(p_tenant uuid) returns text language sql as $$
  select coalesce(string_agg(module::text, ',' order by module::text), '')
    from core.tenant_modules where tenant_id = p_tenant and is_enabled;
$$;

-- ============================================================================
-- A. Registry, dependency, cafe package
-- ============================================================================
select is((select count(*)::int from core.module_registry where module in ('purchases', 'recipes')),
  2, 'A: module_registry has purchases and recipes');
select is((select lifecycle_status::text from core.module_registry where module = 'purchases'), 'beta', 'A: purchases is beta');
select is((select lifecycle_status::text from core.module_registry where module = 'recipes'), 'beta', 'A: recipes is beta');
select is((select string_agg(depends_on::text, ',') from core.module_dependencies where module = 'purchases'),
  'inventory', 'A: purchases depends on inventory (and only on it)');
select is((select count(*)::int from core.module_dependencies where module = 'recipes'),
  0, 'A: recipes has no dependency');
select is((select count(*)::int from core.package_modules where package_code = 'cafe' and module in ('purchases', 'recipes')),
  2, 'A: the cafe package contains purchases and recipes');
select is((select string_agg(module::text, ',' order by sort_order) from core.package_modules where package_code = 'cafe'),
  'core,workforce,inventory,purchases,operations,recipes,issues', 'A: cafe modules in navigation order');

-- ============================================================================
-- B. The moved gates
-- ============================================================================
create temp table t_gates as
select n.nspname || '.' || c.relname as rel, p.polname,
       coalesce(pg_get_expr(p.polqual, p.polrelid), '') || ' ' || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') as expr
  from pg_policy p
  join pg_class c on c.oid = p.polrelid
  join pg_namespace n on n.oid = c.relnamespace
 where p.polrelid in ('purchases.purchase_actions'::regclass, 'workforce.recipes'::regclass, 'workforce.recipe_categories'::regclass,
                      'workforce.recipe_ingredients'::regclass, 'workforce.recipe_steps'::regclass, 'workforce.recipe_notes'::regclass)
    or (p.polrelid = 'storage.objects'::regclass and p.polname in ('recipe_media_select', 'recipe_media_insert', 'recipe_media_delete'));

select is((select count(*)::int from t_gates), 24, 'B: 24 policies in scope (2 purchases, 19 recipe tables, 3 recipe media)');
select is((select count(*)::int from t_gates where rel = 'purchases.purchase_actions'
             and expr ~ '''purchases''::(core\.)?module_code'), 2,
  'B: both purchase_actions policies gate on purchases');
select is((select count(*)::int from t_gates where rel <> 'purchases.purchase_actions'
             and expr ~ '''recipes''::(core\.)?module_code'), 22,
  'B: all 22 recipe table + recipe media policies gate on recipes');
select is((select count(*)::int from t_gates where expr ~ '''(workforce|inventory)''::(core\.)?module_code'), 0,
  'B: no moved policy still gates on workforce or inventory');

create temp table t_fns as
select fn, pg_get_functiondef(fn::regprocedure) as def from (values
  ('api.record_purchase_action(uuid,uuid,uuid)'),
  ('api.record_purchase_order(uuid,uuid,uuid,numeric)'),
  ('api.record_purchase_receipt(uuid,uuid,uuid,numeric,uuid)'),
  ('api.weekly_review_summary(uuid,uuid,date,date,timestamp with time zone,timestamp with time zone)'),
  ('workforce.permanently_delete_recipe(uuid,uuid)')) v(fn);

select is((select count(*)::int from t_fns where fn like '%purchase%' or fn like 'api.weekly%'), 4, 'B: the four purchases functions exist');
select is((select count(*)::int from t_fns where (fn like '%purchase%' or fn like 'api.weekly%')
             and def like '%has_module_access(p_tenant_id, ''purchases'')%'), 4,
  'B: record_purchase_action/order/receipt and weekly_review_summary gate on purchases');
select is((select count(*)::int from t_fns where def like '%has_module_access(p_tenant_id, ''inventory'')%'), 0,
  'B: none of the five functions still gates on inventory');
select ok((select def like '%has_module_access(p_tenant_id, ''recipes'')%' from t_fns where fn like 'workforce.permanently_delete_recipe%'),
  'B: workforce.permanently_delete_recipe gates on recipes');
select ok((select def not like '%has_module_access(p_tenant_id, ''workforce'')%' from t_fns where fn like 'workforce.permanently_delete_recipe%'),
  'B: workforce.permanently_delete_recipe no longer gates on workforce');
select ok((select def like '%has_module_access(p_tenant_id, ''workforce'')%' from t_fns where fn like 'api.weekly%'),
  'B: weekly_review_summary keeps its own workforce-section gate (not a moved gate)');

-- ============================================================================
-- C. Behaviour on a non-managed tenant (direct tenant_modules rows)
-- ============================================================================
insert into core.tenants (id, slug, name) values
  ('b7000000-0000-0000-0000-00000000000a', 'pgtap-0131-direct', 'pgTAP 0131 Direct');
insert into core.tenant_modules (tenant_id, module, is_enabled) values
  ('b7000000-0000-0000-0000-00000000000a', 'workforce', true),
  ('b7000000-0000-0000-0000-00000000000a', 'recipes', true),
  ('b7000000-0000-0000-0000-00000000000a', 'inventory', true),
  ('b7000000-0000-0000-0000-00000000000a', 'purchases', true);
insert into core.locations (id, tenant_id, name, timezone) values
  ('b7200000-0000-0000-0000-000000000001', 'b7000000-0000-0000-0000-00000000000a', 'Direct L1', 'Asia/Tokyo');
insert into core.users (id, display_name) values
  ('b7900000-0000-0000-0000-000000000001', 'Direct Manager L1');
insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('b7000000-0000-0000-0000-00000000000a', 'b7900000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000005', 'b7200000-0000-0000-0000-000000000001'); -- manager
insert into workforce.employees (id, tenant_id, location_id, name_encrypted, is_active) values
  ('b7300000-0000-0000-0000-000000000001', 'b7000000-0000-0000-0000-00000000000a', 'b7200000-0000-0000-0000-000000000001', '\x00', true);
insert into workforce.recipes (id, tenant_id, location_id, title_ja, status) values
  ('b7400000-0000-0000-0000-000000000001', 'b7000000-0000-0000-0000-00000000000a', 'b7200000-0000-0000-0000-000000000001', 'Latte', 'published'),
  ('b7400000-0000-0000-0000-000000000002', 'b7000000-0000-0000-0000-00000000000a', 'b7200000-0000-0000-0000-000000000001', 'Old recipe', 'archived');
insert into workforce.recipe_ingredients (tenant_id, recipe_id, label_ja) values
  ('b7000000-0000-0000-0000-00000000000a', 'b7400000-0000-0000-0000-000000000001', 'Milk');
insert into inventory.items (id, tenant_id, location_id, name, unit, required_quantity, reorder_point) values
  ('b7500000-0000-0000-0000-000000000001', 'b7000000-0000-0000-0000-00000000000a', 'b7200000-0000-0000-0000-000000000001', 'Beans', 'kg', 10, 5);
insert into inventory.stock_counts (tenant_id, location_id, item_id, actual_quantity, counted_by) values
  ('b7000000-0000-0000-0000-00000000000a', 'b7200000-0000-0000-0000-000000000001', 'b7500000-0000-0000-0000-000000000001', 2,
   'b7900000-0000-0000-0000-000000000001');

-- C1. recipes OFF, workforce ON
select pg_temp.set_module('b7000000-0000-0000-0000-00000000000a', 'recipes', false);

select is(pg_temp.as_auth_count('b7900000-0000-0000-0000-000000000001',
  $$ select count(*)::int from workforce.recipes where tenant_id = 'b7000000-0000-0000-0000-00000000000a' $$),
  0, 'C1: recipes OFF -> the Manager sees no recipe rows');
select is(pg_temp.as_auth_count('b7900000-0000-0000-0000-000000000001',
  $$ select count(*)::int from api.workforce_recipe_ingredients where recipe_id = 'b7400000-0000-0000-0000-000000000001' $$),
  0, 'C1: recipes OFF -> no recipe ingredients through the api view');
select is(pg_temp.as_auth_sqlstate('b7900000-0000-0000-0000-000000000001',
  $$ insert into workforce.recipes (tenant_id, location_id, title_ja, status)
       values ('b7000000-0000-0000-0000-00000000000a', 'b7200000-0000-0000-0000-000000000001', 'New', 'draft') $$),
  '42501', 'C1: recipes OFF -> recipe INSERT refused by RLS');
select is(pg_temp.as_auth_sqlstate('b7900000-0000-0000-0000-000000000001',
  $$ insert into workforce.recipe_ingredients (tenant_id, recipe_id, label_ja)
       values ('b7000000-0000-0000-0000-00000000000a', 'b7400000-0000-0000-0000-000000000001', 'Sugar') $$),
  '42501', 'C1: recipes OFF -> recipe ingredient INSERT refused by RLS');
select is(pg_temp.as_auth_count('b7900000-0000-0000-0000-000000000001',
  $$ select count(*)::int from api.permanently_delete_recipe('b7000000-0000-0000-0000-00000000000a', 'b7400000-0000-0000-0000-000000000002') r where r.deleted $$),
  0, 'C1: recipes OFF -> permanently_delete_recipe refuses (reports no deletion)');
select is((select count(*)::int from workforce.recipes where id = 'b7400000-0000-0000-0000-000000000002'),
  1, 'C1: ... and the archived recipe still exists');
select is(pg_temp.as_auth_count('b7900000-0000-0000-0000-000000000001',
  $$ select count(*)::int from api.workforce_staff_directory where tenant_id = 'b7000000-0000-0000-0000-00000000000a' $$),
  1, 'C1: recipes OFF does not touch Workforce -> the Manager still sees the staff directory');
select is(pg_temp.as_auth_sqlstate('b7900000-0000-0000-0000-000000000001',
  $$ insert into workforce.shift_requests (tenant_id, location_id, employee_id, work_date, status)
       values ('b7000000-0000-0000-0000-00000000000a', 'b7200000-0000-0000-0000-000000000001',
               'b7300000-0000-0000-0000-000000000001', current_date + 2, 'pending') $$),
  'ok', 'C1: recipes OFF does not touch Workforce -> the Manager can still write a shift request');

-- C2. purchases OFF, inventory ON
select pg_temp.set_module('b7000000-0000-0000-0000-00000000000a', 'recipes', true);
select pg_temp.set_module('b7000000-0000-0000-0000-00000000000a', 'purchases', false);

select is(pg_temp.as_auth_sqlstate('b7900000-0000-0000-0000-000000000001',
  $$ select * from api.record_purchase_action('b7000000-0000-0000-0000-00000000000a', 'b7200000-0000-0000-0000-000000000001', 'b7500000-0000-0000-0000-000000000001') $$),
  'P0004', 'C2: purchases OFF -> record_purchase_action refused (purchases_module_disabled)');
select is(pg_temp.as_auth_sqlstate('b7900000-0000-0000-0000-000000000001',
  $$ select * from api.record_purchase_order('b7000000-0000-0000-0000-00000000000a', 'b7200000-0000-0000-0000-000000000001', 'b7500000-0000-0000-0000-000000000001', 5) $$),
  'P0004', 'C2: purchases OFF -> record_purchase_order refused');
select is(pg_temp.as_auth_sqlstate('b7900000-0000-0000-0000-000000000001',
  $$ select * from api.record_purchase_receipt('b7000000-0000-0000-0000-00000000000a', 'b7200000-0000-0000-0000-000000000001', 'b7500000-0000-0000-0000-000000000001', 5) $$),
  'P0004', 'C2: purchases OFF -> record_purchase_receipt refused');
select is(jsonb_typeof(pg_temp.as_auth_jsonb('b7900000-0000-0000-0000-000000000001',
  $$ select api.weekly_review_summary('b7000000-0000-0000-0000-00000000000a'::uuid, 'b7200000-0000-0000-0000-000000000001'::uuid,
       '2026-01-05'::date, '2026-01-11'::date, '2026-01-05 00:00:00+00'::timestamptz, '2026-01-12 00:00:00+00'::timestamptz) $$) -> 'purchasing'),
  'null', 'C2: purchases OFF -> the weekly review purchasing section is null');
select is(pg_temp.as_auth_count('b7900000-0000-0000-0000-000000000001',
  $$ select count(*)::int from inventory.items where tenant_id = 'b7000000-0000-0000-0000-00000000000a' $$),
  1, 'C2: purchases OFF does not touch Inventory -> the Manager still reads inventory items');
select is(pg_temp.as_auth_count('b7900000-0000-0000-0000-000000000001',
  $$ select count(*)::int from inventory.stock_counts where tenant_id = 'b7000000-0000-0000-0000-00000000000a' $$),
  1, 'C2: ... and stock counts');

-- C3. both ON
select pg_temp.set_module('b7000000-0000-0000-0000-00000000000a', 'purchases', true);

select is(pg_temp.as_auth_sqlstate('b7900000-0000-0000-0000-000000000001',
  $$ select * from api.record_purchase_action('b7000000-0000-0000-0000-00000000000a', 'b7200000-0000-0000-0000-000000000001', 'b7500000-0000-0000-0000-000000000001') $$),
  'ok', 'C3: purchases ON -> record_purchase_action works');
select is(pg_temp.as_auth_count('b7900000-0000-0000-0000-000000000001',
  $$ select count(*)::int from purchases.purchase_actions where tenant_id = 'b7000000-0000-0000-0000-00000000000a' $$),
  1, 'C3: purchases ON -> the Manager reads the purchase action');
select is(jsonb_typeof(pg_temp.as_auth_jsonb('b7900000-0000-0000-0000-000000000001',
  $$ select api.weekly_review_summary('b7000000-0000-0000-0000-00000000000a'::uuid, 'b7200000-0000-0000-0000-000000000001'::uuid,
       '2026-01-05'::date, '2026-01-11'::date, '2026-01-05 00:00:00+00'::timestamptz, '2026-01-12 00:00:00+00'::timestamptz) $$) -> 'purchasing'),
  'object', 'C3: purchases ON -> the weekly review purchasing section is computed');
select is(pg_temp.as_auth_count('b7900000-0000-0000-0000-000000000001',
  $$ select count(*)::int from api.workforce_recipes where tenant_id = 'b7000000-0000-0000-0000-00000000000a' $$),
  2, 'C3: recipes ON -> the Manager sees both recipes');
select is(pg_temp.as_auth_sqlstate('b7900000-0000-0000-0000-000000000001',
  $$ insert into workforce.recipe_ingredients (tenant_id, recipe_id, label_ja)
       values ('b7000000-0000-0000-0000-00000000000a', 'b7400000-0000-0000-0000-000000000001', 'Sugar') $$),
  'ok', 'C3: recipes ON -> the Manager can add a recipe ingredient');
select is(pg_temp.as_auth_count('b7900000-0000-0000-0000-000000000001',
  $$ select count(*)::int from api.permanently_delete_recipe('b7000000-0000-0000-0000-00000000000a', 'b7400000-0000-0000-0000-000000000002') r where r.deleted $$),
  1, 'C3: recipes ON -> the same archived recipe can be permanently deleted (positive control for C1)');

-- C4. inventory OFF, purchases ON (a non-managed tenant can be put in this
-- state; the inventory-side RLS still hides the stock data)
select pg_temp.set_module('b7000000-0000-0000-0000-00000000000a', 'inventory', false);

select is(pg_temp.as_auth_count('b7900000-0000-0000-0000-000000000001',
  $$ select count(*)::int from api.purchases_needed where tenant_id = 'b7000000-0000-0000-0000-00000000000a' $$),
  0, 'C4: inventory OFF -> api.purchases_needed is empty (inventory.items/stock_counts are gated)');
select isnt(pg_temp.as_auth_sqlstate('b7900000-0000-0000-0000-000000000001',
  $$ select * from api.record_purchase_receipt('b7000000-0000-0000-0000-00000000000a', 'b7200000-0000-0000-0000-000000000001', 'b7500000-0000-0000-0000-000000000001', 5) $$),
  'ok', 'C4: inventory OFF -> record_purchase_receipt cannot write a stock count');
select is((select count(*)::int from inventory.stock_counts where tenant_id = 'b7000000-0000-0000-0000-00000000000a'),
  1, 'C4: ... no stock count was added');
select pg_temp.set_module('b7000000-0000-0000-0000-00000000000a', 'inventory', true);

-- ============================================================================
-- D. A package-managed cafe tenant
-- ============================================================================
insert into core.tenants (id, slug, name) values
  ('b7000000-0000-0000-0000-00000000000b', 'pgtap-0131-cafe', 'pgTAP 0131 Cafe');

select pg_temp.as_service($$ select core.set_tenant_package('b7000000-0000-0000-0000-00000000000b', 'cafe', true) $$);
select is(pg_temp.enabled('b7000000-0000-0000-0000-00000000000b'),
  'core,inventory,issues,operations,purchases,recipes,workforce', 'D: the cafe package enables purchases and recipes');
select ok(core.has_module_access('b7000000-0000-0000-0000-00000000000b', 'purchases'), 'D: has_module_access purchases');
select ok(core.has_module_access('b7000000-0000-0000-0000-00000000000b', 'recipes'), 'D: has_module_access recipes');

select pg_temp.as_service($$ select core.set_tenant_module_override('b7000000-0000-0000-0000-00000000000b', 'purchases', false, 'pgTAP') $$);
select is(pg_temp.enabled('b7000000-0000-0000-0000-00000000000b'),
  'core,inventory,issues,operations,recipes,workforce', 'D: override purchases=false disables only purchases');
select ok(not core.has_module_access('b7000000-0000-0000-0000-00000000000b', 'purchases'), 'D: has_module_access purchases is false');
select ok(core.has_module_access('b7000000-0000-0000-0000-00000000000b', 'inventory'), 'D: inventory stays on');
select ok(core.has_module_access('b7000000-0000-0000-0000-00000000000b', 'recipes'), 'D: recipes stays on');

select * from finish();
rollback;
