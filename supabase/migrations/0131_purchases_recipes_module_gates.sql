-- ============================================================================
-- 0131 — Purchasing and Recipes as their own modules (packages model, P3 2/2)
-- ----------------------------------------------------------------------------
-- 1. Register 'purchases' (depends on 'inventory': it reads stock counts) and
--    'recipes' (no dependency: cost/allergen panels already degrade when
--    Inventory is off) and add both to the Cafe package.
-- 2. Move every gate: purchases RLS + RPCs + the Weekly Review purchasing
--    block from 'inventory' to 'purchases'; recipe RLS (19 policies), recipe
--    media storage policies (3) and workforce.permanently_delete_recipe from
--    'workforce' to 'recipes'. Rewritten from the live definitions with an
--    exact-count assertion per object, so nothing else in them changes.
-- 3. Zero access change for every tenant: purchases is enabled exactly where
--    inventory was, recipes exactly where workforce was (package-managed
--    tenants via overrides + sync, non-managed tenants via direct rows); the
--    migration asserts it and aborts otherwise.
--
-- Rollback: re-run the same rewrite with the module literals swapped back
-- ('purchases' -> 'inventory', 'recipes' -> 'workforce'), remove the two
-- package_modules rows, the dependency row and the module_registry rows; the
-- enum values from 0130 stay (Postgres cannot remove enum values) and are
-- harmless when unused.
-- ============================================================================

-- --- 0. snapshot the access before anything changes ------------------------------
create temp table m0131_before on commit drop as
select t.id as tenant_id,
       core.has_module_access(t.id, 'inventory') as inventory_on,
       core.has_module_access(t.id, 'workforce') as workforce_on,
       (select coalesce(string_agg(tm.module::text, ',' order by tm.module::text), '')
          from core.tenant_modules tm where tm.tenant_id = t.id and tm.is_enabled) as enabled_before
  from core.tenants t;

-- --- 1. registry, dependency, Cafe package ------------------------------------------
insert into core.module_registry (module, name, description, lifecycle_status, nav_route, nav_sort_order) values
  ('purchases', 'Purchasing', 'Shortage list, order -> receive, bought-at-shop records. Reads Inventory stock counts.', 'beta', null, 25),
  ('recipes', 'Recipes', 'Recipes, steps, translations, ingredient mapping, estimated cost and allergens.', 'beta', null, 30)
on conflict (module) do nothing;

insert into core.module_dependencies (module, depends_on) values ('purchases', 'inventory')
on conflict do nothing;

-- --- 2. keep access identical before the package grows -------------------------------
-- package-managed tenants: opt out of a new module where its old gate was off
insert into core.tenant_module_overrides (tenant_id, module, is_enabled, reason)
select b.tenant_id, 'purchases', false, '0131: inventory was off'
  from m0131_before b
 where core.is_package_managed(b.tenant_id) and not b.inventory_on
on conflict (tenant_id, module) do nothing;
insert into core.tenant_module_overrides (tenant_id, module, is_enabled, reason)
select b.tenant_id, 'recipes', false, '0131: workforce was off'
  from m0131_before b
 where core.is_package_managed(b.tenant_id) and not b.workforce_on
on conflict (tenant_id, module) do nothing;

insert into core.package_modules (package_code, module, sort_order) values
  ('cafe', 'purchases', 25), ('cafe', 'recipes', 35)
on conflict do nothing;

do $$
declare t uuid;
begin
  for t in select tenant_id from m0131_before where core.is_package_managed(tenant_id) order by 1 loop
    perform core.sync_tenant_modules(t);
  end loop;
end $$;

-- non-managed tenants (seed / legacy writers, DEBT-102): direct rows mirroring the old gate
insert into core.tenant_modules (tenant_id, module, is_enabled)
select b.tenant_id, 'purchases', true from m0131_before b
 where not core.is_package_managed(b.tenant_id) and b.inventory_on
on conflict (tenant_id, module) do update set is_enabled = true;
insert into core.tenant_modules (tenant_id, module, is_enabled)
select b.tenant_id, 'recipes', true from m0131_before b
 where not core.is_package_managed(b.tenant_id) and b.workforce_on
on conflict (tenant_id, module) do update set is_enabled = true;

-- --- 3. move the gates ------------------------------------------------------------------
-- Policies: replace the module literal inside core.has_module_access(...) only.
do $$
declare
  r record;
  v_qual text;
  v_check text;
  v_from text;
  v_to text;
  v_cmd text;
  v_done int := 0;
begin
  for r in
    select p.polrelid::regclass::text as rel, p.polname, p.polrelid,
           pg_get_expr(p.polqual, p.polrelid) as qual, pg_get_expr(p.polwithcheck, p.polrelid) as wcheck
      from pg_policy p
     where (p.polrelid::regclass::text = 'purchases.purchase_actions')
        or (p.polrelid::regclass::text in ('workforce.recipes', 'workforce.recipe_categories', 'workforce.recipe_ingredients',
                                           'workforce.recipe_steps', 'workforce.recipe_notes'))
        or (p.polrelid = 'storage.objects'::regclass and p.polname in ('recipe_media_select', 'recipe_media_insert', 'recipe_media_delete'))
  loop
    if r.rel = 'purchases.purchase_actions' then
      v_from := 'inventory'; v_to := 'purchases';
    else
      v_from := 'workforce'; v_to := 'recipes';
    end if;
    -- the module literal appears in these policies only as the has_module_access
    -- argument (permissions are text keys), so an exact literal replace is precise
    v_qual := replace(r.qual, '''' || v_from || '''::core.module_code', '''' || v_to || '''::core.module_code');
    v_check := replace(r.wcheck, '''' || v_from || '''::core.module_code', '''' || v_to || '''::core.module_code');
    if v_qual is not distinct from r.qual and v_check is not distinct from r.wcheck then
      continue;  -- policy without a module gate (e.g. none expected; tolerated)
    end if;
    v_cmd := format('alter policy %I on %s', r.polname, r.rel);
    if r.qual is not null then v_cmd := v_cmd || format(' using (%s)', v_qual); end if;
    if r.wcheck is not null then v_cmd := v_cmd || format(' with check (%s)', v_check); end if;
    execute v_cmd;
    v_done := v_done + 1;
  end loop;
  if v_done <> 24 then
    raise exception '0131: expected 24 gated policies to move, moved %', v_done;
  end if;
end $$;

-- Functions: one exact gate literal each, rewritten from the live definition.
do $$
declare
  f record;
  v_def text;
  v_new text;
  v_n int;
begin
  for f in
    select * from (values
      ('api.record_purchase_action',      'has_module_access(p_tenant_id, ''inventory'')', 'has_module_access(p_tenant_id, ''purchases'')', 1),
      ('api.record_purchase_order',       'has_module_access(p_tenant_id, ''inventory'')', 'has_module_access(p_tenant_id, ''purchases'')', 1),
      ('api.record_purchase_receipt',     'has_module_access(p_tenant_id, ''inventory'')', 'has_module_access(p_tenant_id, ''purchases'')', 1),
      ('api.weekly_review_summary',       'has_module_access(p_tenant_id, ''inventory'')', 'has_module_access(p_tenant_id, ''purchases'')', 1),
      ('workforce.permanently_delete_recipe', 'has_module_access(p_tenant_id, ''workforce'')', 'has_module_access(p_tenant_id, ''recipes'')', 1)
    ) as v(fn, old_gate, new_gate, expected)
  loop
    select pg_get_functiondef(p.oid) into v_def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname || '.' || p.proname = f.fn and p.prokind = 'f';
    if v_def is null then raise exception '0131: function % not found', f.fn; end if;
    v_n := (length(v_def) - length(replace(v_def, f.old_gate, ''))) / length(f.old_gate);
    if v_n <> f.expected then
      raise exception '0131: % has % occurrences of %, expected %', f.fn, v_n, f.old_gate, f.expected;
    end if;
    v_new := replace(v_def, f.old_gate, f.new_gate);
    execute v_new;
  end loop;
end $$;

-- --- 4. assert zero access change ---------------------------------------------------------
do $$
declare v_bad int;
begin
  select count(*) into v_bad
    from m0131_before b
   where core.has_module_access(b.tenant_id, 'purchases') is distinct from b.inventory_on
      or core.has_module_access(b.tenant_id, 'recipes') is distinct from b.workforce_on
      or (select coalesce(string_agg(tm.module::text, ',' order by tm.module::text), '')
            from core.tenant_modules tm
           where tm.tenant_id = b.tenant_id and tm.is_enabled and tm.module not in ('purchases', 'recipes'))
         is distinct from b.enabled_before;
  if v_bad > 0 then
    raise exception '0131 would change module access for % tenant(s); aborting', v_bad;
  end if;
end $$;
