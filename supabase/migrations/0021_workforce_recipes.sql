-- ============================================================================
-- 0021  Workforce: recipe/manual sharing tables + recipe.* permissions
--       (Phase 1L-1)
-- ----------------------------------------------------------------------------
-- New, self-contained recipe tables (no dependency on shifts/attendance).
-- Recipes are tenant-wide reference material, not per-store; workforce.
-- employees is unaffected (see 0020_workforce_staff_profile_extension.sql).
--
-- Cross-tenant FK strategy (new pattern in this codebase): recipe_categories
-- and recipes each carry `unique (tenant_id, id)` so every child row's FK is
-- a COMPOSITE foreign key `(tenant_id, parent_id) references
-- parent(tenant_id, id)` instead of a plain `parent_id references
-- parent(id)`. This makes "a child row can only ever point at a parent row
-- in the same tenant" a hard, database-enforced constraint, not just an RLS/
-- application-layer convention.
--
-- RLS scope note: RLS is enabled on every table below in this same
-- migration, but NO policies are added yet -- with RLS on and zero
-- permissive policies, these tables are fully closed to anon/authenticated
-- (same as today; no grant is added either). Real policy design is Phase
-- 1L-2 work. This is the strictest possible state for a schema-only phase.
-- ============================================================================

-- core.locations prerequisite for a tenant-safe composite FK from recipes ---
-- core.locations (0002_core_tables.sql, immutable -- not edited here) has no
-- unique(tenant_id, id) constraint today, only the single-column primary key
-- on id. Adding one is purely additive and can never fail against existing
-- data: id is already globally unique via the primary key, so (tenant_id, id)
-- is trivially unique for every row that exists or ever will. This mirrors
-- the same unique(tenant_id, id) pattern this migration already uses on
-- workforce.recipe_categories/recipes, and is what lets recipes.location_id
-- below be a genuine composite FK instead of a same-named-but-unenforced
-- tenant_id column (see the header note on the cross-tenant FK strategy).
alter table core.locations
  add constraint locations_tenant_id_id_key unique (tenant_id, id);

-- Recipe categories -----------------------------------------------------------
create table if not exists workforce.recipe_categories (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references core.tenants(id) on delete cascade,
  label_ja    text not null,
  label_en    text,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (tenant_id, id)
);
create index if not exists wf_recipe_categories_tenant_idx
  on workforce.recipe_categories(tenant_id, is_active, sort_order);
comment on table workforce.recipe_categories is 'Tenant-wide recipe/manual categories. No location_id: shared across a tenant''s locations.';

-- Recipes -----------------------------------------------------------------
create table if not exists workforce.recipes (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references core.tenants(id) on delete cascade,
  -- NULL = tenant-wide recipe (visible/applicable across all of the tenant's
  -- locations). Non-null = specific to that one location. No inline
  -- `references core.locations(id)` here -- see the composite FK below,
  -- which enforces that a non-null location_id must belong to this same
  -- tenant_id (a plain single-column FK to core.locations(id) would let a
  -- Tenant A recipe point at a Tenant B location).
  location_id         uuid,
  recipe_category_id  uuid,
  title_ja            text not null,
  title_en            text,
  description_ja      text,
  description_en      text,
  is_popular          boolean not null default false,
  -- Publish lifecycle. text + check, not an enum (single-table, still-
  -- evolving authoring concept -- unlike the cross-table request_status /
  -- attendance_status enums 0009_workforce.sql established) and not an
  -- overload of is_active (recipes has no is_active column; 'archived' is
  -- the single retirement signal so there are never two overlapping
  -- lifecycle flags to keep in sync).
  status              text not null default 'draft'
                         check (status in ('draft', 'published', 'archived')),
  created_by          uuid references core.users(id),
  updated_by          uuid references core.users(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, recipe_category_id)
    references workforce.recipe_categories(tenant_id, id),
  -- Composite FK: a recipe's location_id, if set, must belong to the same
  -- tenant_id -- this is the hard, database-enforced cross-tenant guard for
  -- location_id (mirrors the recipe_category_id FK above).
  --
  -- Deliberately NO `on delete set null` here. A composite FK's ON DELETE
  -- SET NULL action nulls *every* column in the FK on the referenced row's
  -- delete -- including tenant_id, which is NOT NULL and must never be
  -- mutated by an unrelated location deletion (that would either raise a
  -- NOT NULL violation or, worse, corrupt tenant scoping). The safe
  -- alternative is the default NO ACTION (matching the recipe_category_id FK
  -- above, which also has no ON DELETE clause): deleting a core.locations
  -- row that still has a recipe with a non-null location_id pointing at it
  -- is blocked until the caller explicitly clears that recipe's location_id
  -- (promoting it to tenant-wide) or reassigns/archives it first -- an
  -- explicit decision instead of a silent cascade.
  constraint recipes_location_tenant_fkey
    foreign key (tenant_id, location_id)
      references core.locations(tenant_id, id)
);
create index if not exists wf_recipes_tenant_status_idx
  on workforce.recipes(tenant_id, status, is_popular);
create index if not exists wf_recipes_tenant_location_idx
  on workforce.recipes(tenant_id, location_id);
comment on table workforce.recipes is 'Tenant recipe/manual content. location_id NULL = tenant-wide; non-null = location-specific.';
comment on column workforce.recipes.status is 'draft | published | archived. Not a PostgreSQL enum -- single-table, evolving authoring concept.';

-- Recipe ingredients ------------------------------------------------------
create table if not exists workforce.recipe_ingredients (
  id          uuid primary key default gen_random_uuid(),
  -- Denormalized from the parent recipe, required for direct RLS predicates
  -- without a join, matching the composite-FK cross-tenant guard below.
  tenant_id   uuid not null,
  recipe_id   uuid not null,
  label_ja    text not null,
  label_en    text,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  foreign key (tenant_id, recipe_id)
    references workforce.recipes(tenant_id, id) on delete cascade
);
create index if not exists wf_recipe_ingredients_recipe_idx
  on workforce.recipe_ingredients(recipe_id);

-- Recipe steps --------------------------------------------------------------
create table if not exists workforce.recipe_steps (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null,
  recipe_id        uuid not null,
  step_number      integer not null,
  instruction_ja   text not null,
  instruction_en   text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  foreign key (tenant_id, recipe_id)
    references workforce.recipes(tenant_id, id) on delete cascade
);
create index if not exists wf_recipe_steps_recipe_idx
  on workforce.recipe_steps(recipe_id);

-- Recipe notes ----------------------------------------------------------------
create table if not exists workforce.recipe_notes (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  recipe_id   uuid not null,
  title_ja    text,
  title_en    text,
  body_ja     text not null,
  body_en     text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  foreign key (tenant_id, recipe_id)
    references workforce.recipes(tenant_id, id) on delete cascade
);
create index if not exists wf_recipe_notes_recipe_idx
  on workforce.recipe_notes(recipe_id);

-- updated_at triggers -----------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'workforce.recipe_categories', 'workforce.recipes',
    'workforce.recipe_ingredients', 'workforce.recipe_steps', 'workforce.recipe_notes'
  ] loop
    execute format(
      'drop trigger if exists set_updated_at on %s; '
      'create trigger set_updated_at before update on %s '
      'for each row execute function core.set_updated_at();', t, t);
  end loop;
end $$;

-- RLS -------------------------------------------------------------------------
-- Enabled immediately; no policies added in this migration (see header note).
alter table workforce.recipe_categories  enable row level security;
alter table workforce.recipes            enable row level security;
alter table workforce.recipe_ingredients enable row level security;
alter table workforce.recipe_steps       enable row level security;
alter table workforce.recipe_notes       enable row level security;

-- Permission catalog ------------------------------------------------------
insert into core.permissions (key, module, description) values
  ('workforce.recipe.read',    'workforce', 'View published recipes'),
  ('workforce.recipe.manage',  'workforce', 'Create / edit / archive recipe content'),
  ('workforce.recipe.publish', 'workforce', 'Publish / unpublish recipes')
on conflict (key) do update set description = excluded.description, module = excluded.module;

-- Role -> permission mappings (owner/admin/manager get all three; employee
-- gets recipe.read only).
do $$
declare
  r_owner   uuid := '00000000-0000-0000-0000-000000000003';
  r_admin   uuid := '00000000-0000-0000-0000-000000000004';
  r_manager uuid := '00000000-0000-0000-0000-000000000005';
  r_emp     uuid := '00000000-0000-0000-0000-000000000006';
begin
  insert into core.role_permissions (role_id, permission_key) values
    (r_owner,   'workforce.recipe.read'),
    (r_owner,   'workforce.recipe.manage'),
    (r_owner,   'workforce.recipe.publish'),
    (r_admin,   'workforce.recipe.read'),
    (r_admin,   'workforce.recipe.manage'),
    (r_admin,   'workforce.recipe.publish'),
    (r_manager, 'workforce.recipe.read'),
    (r_manager, 'workforce.recipe.manage'),
    (r_manager, 'workforce.recipe.publish'),
    (r_emp,     'workforce.recipe.read')
  on conflict do nothing;
end $$;
