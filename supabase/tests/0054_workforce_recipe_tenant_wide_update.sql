-- ============================================================================
-- DB test: api.upsert_workforce_recipe — tenant-wide recipe edit/publish
-- (migration 0113)
-- ----------------------------------------------------------------------------
-- Run with:  pnpm exec supabase db reset && pnpm exec supabase test db
--
-- Proves the fix for the bug reproduced on current dev (2026-08-29): the
-- RPC's UPDATE branch matched `r.location_id = p_location_id`, which is
-- NULL = <uuid> (never true) for a tenant-wide recipe (location_id IS NULL),
-- so a Manager could never edit or (re-)publish one — it raised
-- recipe_not_found. Same bug class main's historical 0060 fixed; 0113 applies
-- the one-line fix to current dev's (0081) function body.
--
-- Covers: Manager editing a LOCATION-scoped recipe (control, still works);
-- Manager editing + publishing a TENANT-WIDE recipe (the fix); tenant
-- isolation; location isolation (a Manager cannot touch ANOTHER location's
-- recipe — the fix must not widen that).
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, workforce, content, api;

select no_plan();

-- --- Fixtures --------------------------------------------------------
insert into core.tenants (id, slug, name, kind) values
  ('0a110000-0000-0000-0000-00000000c001', 'pgtap-rec-a', 'pgTAP Rec A', 'client'),
  ('0b220000-0000-0000-0000-00000000c002', 'pgtap-rec-b', 'pgTAP Rec B', 'client');
insert into core.tenant_modules (tenant_id, module, is_enabled) values
  ('0a110000-0000-0000-0000-00000000c001', 'workforce', true),
  ('0b220000-0000-0000-0000-00000000c002', 'workforce', true);
insert into core.locations (id, tenant_id, name, timezone) values
  ('0a100000-0000-0000-0000-00000000c001', '0a110000-0000-0000-0000-00000000c001', 'A/L1', 'Asia/Tokyo'),
  ('0a100000-0000-0000-0000-00000000c002', '0a110000-0000-0000-0000-00000000c001', 'A/L2', 'Asia/Tokyo'),
  ('0b100000-0000-0000-0000-00000000c001', '0b220000-0000-0000-0000-00000000c002', 'B/L1', 'Asia/Tokyo');
insert into core.users (id, display_name) values
  ('0a900000-0000-0000-0000-00000000c001', 'Rec A Manager TW'),
  ('0a900000-0000-0000-0000-00000000c002', 'Rec A Manager L1'),
  ('0b900000-0000-0000-0000-00000000c003', 'Rec B Manager TW');
insert into core.tenant_memberships (tenant_id, user_id, status) values
  ('0a110000-0000-0000-0000-00000000c001', '0a900000-0000-0000-0000-00000000c001', 'active'),
  ('0a110000-0000-0000-0000-00000000c001', '0a900000-0000-0000-0000-00000000c002', 'active'),
  ('0b220000-0000-0000-0000-00000000c002', '0b900000-0000-0000-0000-00000000c003', 'active');
-- A Manager TW = manager tenant-wide (recipe.manage/publish in-tenant).
-- A Manager L1 = manager scoped to A/L1 only.
insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('0a110000-0000-0000-0000-00000000c001', '0a900000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-000000000005', null),
  ('0a110000-0000-0000-0000-00000000c001', '0a900000-0000-0000-0000-00000000c002', '00000000-0000-0000-0000-000000000005', '0a100000-0000-0000-0000-00000000c001'),
  ('0b220000-0000-0000-0000-00000000c002', '0b900000-0000-0000-0000-00000000c003', '00000000-0000-0000-0000-000000000005', null);

-- recipes: R_tw = tenant-wide (location_id NULL), R_l1 = A/L1-scoped,
-- R_l2 = A/L2-scoped. All start as draft.
insert into workforce.recipes (id, tenant_id, location_id, title_ja, content_kind, status, original_language, created_by, updated_by) values
  ('4ec10000-0000-0000-0000-00000000c0a1', '0a110000-0000-0000-0000-00000000c001', null,                                   'テナント全体', 'recipe', 'draft', 'ja', '0a900000-0000-0000-0000-00000000c001', '0a900000-0000-0000-0000-00000000c001'),
  ('4ec10000-0000-0000-0000-00000000c0a2', '0a110000-0000-0000-0000-00000000c001', '0a100000-0000-0000-0000-00000000c001', 'L1レシピ',     'recipe', 'draft', 'ja', '0a900000-0000-0000-0000-00000000c001', '0a900000-0000-0000-0000-00000000c001'),
  ('4ec10000-0000-0000-0000-00000000c0a3', '0a110000-0000-0000-0000-00000000c001', '0a100000-0000-0000-0000-00000000c002', 'L2レシピ',     'recipe', 'draft', 'ja', '0a900000-0000-0000-0000-00000000c001', '0a900000-0000-0000-0000-00000000c001');

-- --- helper --------------------------------------------------------
create function pg_temp.as_auth(p_sub text, p_sql text)
returns text language plpgsql as $$
declare r text;
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  perform set_config('request.jwt.claims', '', true);
  perform set_config('app.current_user_id', '', true);
  set local role authenticated;
  execute p_sql into r;
  reset role;
  return r;
exception when others then
  reset role;
  return 'ERR: ' || sqlerrm;
end $$;

-- --- structure: the fix is in place -------------------------------
select is(
  (select position('or r.location_id is null' in pg_get_functiondef(oid))
     from pg_proc where proname = 'upsert_workforce_recipe' and pronamespace = 'api'::regnamespace) > 0,
  true, '0113: api.upsert_workforce_recipe matches tenant-wide rows (or r.location_id is null)');
select is(
  (select prosecdef from pg_proc where proname = 'upsert_workforce_recipe' and pronamespace = 'api'::regnamespace),
  false, '0113: api.upsert_workforce_recipe is SECURITY INVOKER (RLS is the boundary)');

-- --- control: LOCATION-scoped recipe edit + publish still works ----
select isnt(
  pg_temp.as_auth('0a900000-0000-0000-0000-00000000c001', $$
    select api.upsert_workforce_recipe('0a110000-0000-0000-0000-00000000c001', '0a100000-0000-0000-0000-00000000c001',
      '4ec10000-0000-0000-0000-00000000c0a2', 'recipe', 'L1レシピv2', null, 'published',
      '[]'::jsonb, '[]'::jsonb, null, null, null, 'ja', false)::text $$),
  'ERR: recipe_not_found', 'control: Manager edits + publishes a LOCATION-scoped recipe (works)');
select is(
  (select status from workforce.recipes where id = '4ec10000-0000-0000-0000-00000000c0a2'),
  'published', 'control: the L1 recipe is now published');

-- --- THE FIX: tenant-wide recipe edit + publish -------------------
select is(
  pg_temp.as_auth('0a900000-0000-0000-0000-00000000c001', $$
    select api.upsert_workforce_recipe('0a110000-0000-0000-0000-00000000c001', '0a100000-0000-0000-0000-00000000c001',
      '4ec10000-0000-0000-0000-00000000c0a1', 'recipe', 'テナント全体v2', null, 'published',
      '[]'::jsonb, '[]'::jsonb, null, null, null, 'ja', false)::text $$),
  '4ec10000-0000-0000-0000-00000000c0a1',
  '0113: Manager (tenant-wide) can edit + publish a TENANT-WIDE recipe (was recipe_not_found before the fix)');
select is(
  (select status || ' / ' || title_ja from workforce.recipes where id = '4ec10000-0000-0000-0000-00000000c0a1'),
  'published / テナント全体v2', '0113: the tenant-wide recipe is published and retitled');

-- an L1-scoped Manager can also edit the tenant-wide recipe (RLS already
-- allows this via has_permission_in_tenant — the fix does not change it)
select isnt(
  pg_temp.as_auth('0a900000-0000-0000-0000-00000000c002', $$
    select api.upsert_workforce_recipe('0a110000-0000-0000-0000-00000000c001', '0a100000-0000-0000-0000-00000000c001',
      '4ec10000-0000-0000-0000-00000000c0a1', 'recipe', 'テナント全体v3', null, 'published',
      '[]'::jsonb, '[]'::jsonb, null, null, null, 'ja', false)::text $$),
  'ERR: recipe_not_found', '0113: an L1-scoped Manager can also edit the tenant-wide recipe');

-- --- location isolation: the fix must NOT let a Manager touch ANOTHER
--     location's scoped recipe -----------------------------------------
select is(
  pg_temp.as_auth('0a900000-0000-0000-0000-00000000c002', $$
    select api.upsert_workforce_recipe('0a110000-0000-0000-0000-00000000c001', '0a100000-0000-0000-0000-00000000c001',
      '4ec10000-0000-0000-0000-00000000c0a3', 'recipe', 'L2ハイジャック', null, 'published',
      '[]'::jsonb, '[]'::jsonb, null, null, null, 'ja', false)::text $$),
  'ERR: recipe_not_found',
  '0113: an L1-scoped Manager still CANNOT edit an L2-scoped recipe (WHERE clause + RLS)');
select is(
  (select title_ja from workforce.recipes where id = '4ec10000-0000-0000-0000-00000000c0a3'),
  'L2レシピ', '0113: the L2 recipe is unchanged after the blocked cross-location edit');

-- --- tenant isolation --------------------------------------------
select is(
  pg_temp.as_auth('0b900000-0000-0000-0000-00000000c003', $$
    select api.upsert_workforce_recipe('0a110000-0000-0000-0000-00000000c001', '0b100000-0000-0000-0000-00000000c001',
      '4ec10000-0000-0000-0000-00000000c0a1', 'recipe', 'クロステナント', null, 'published',
      '[]'::jsonb, '[]'::jsonb, null, null, null, 'ja', false)::text $$),
  'ERR: recipe_not_found', '0113: a tenant-B Manager cannot edit a tenant-A tenant-wide recipe');

select * from finish();
rollback;
