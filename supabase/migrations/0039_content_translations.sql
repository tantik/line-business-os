-- ============================================================================
-- 0039  Content translations: reusable user-generated-content translation
--       foundation (Recipes is the first consumer)
-- ----------------------------------------------------------------------------
-- SCOPE OF THIS MIGRATION (read before extending): this is the DATA MODEL +
-- RLS foundation plus a MANUAL-ONLY write path. No automatic/machine
-- translation provider is called anywhere in this codebase as of this
-- migration -- see docs/phase-1o-inventory-daily-stock-check-implementation-report.md,
-- "User-generated content translation" section, for what is and is not
-- implemented and why automatic provider integration is deliberately
-- deferred to a separate feature branch (keeping a large external-API
-- integration out of an already-large Inventory/RLS/i18n branch).
--
-- WHY A NEW `content` SCHEMA (not nested in `workforce`): this is designed as
-- a cross-module reusable capability (recipes today; manuals/checklists/
-- inventory item descriptions/knowledge-base articles/booking instructions
-- tomorrow), not a Recipes-specific feature -- naming and schema placement
-- reflect that from the start so no later consumer needs a rename/migration
-- of this table, even though Recipes is the only caller wired up now.
--
-- WHY NOT A GENERIC POLYMORPHIC FOREIGN KEY: `source_entity_id` is a plain
-- `uuid` with NO foreign key -- a polymorphic FK (one column referencing
-- different tables depending on `source_entity_type`) is not expressible as
-- a real Postgres constraint without either a trigger-based integrity check
-- (extra complexity/risk for an MVP) or a separate FK per possible target
-- table (defeats the purpose of a generic column). Referential integrity for
-- this column is enforced at the RLS/application layer instead: every read/
-- write RLS policy below resolves the referenced row through
-- `content.can_read_translation_source`/`can_manage_translation_source`,
-- which look the row up in its OWN table and inherit that table's OWN RLS --
-- a `source_entity_id` that doesn't resolve to a visible row simply matches
-- nothing, the same fail-closed behavior a real FK would give for integrity,
-- without the schema coupling a polymorphic FK would require.
--
-- LIFECYCLE MODEL (brief 2B):
--   * Original content is never modified by this feature -- `workforce.recipes`
--     etc. are untouched by this migration.
--   * `source_content_hash` snapshots the original field's content at
--     translation time (sha256 of the source text, computed by the caller
--     -- see the write facade, 0040). If the original changes, a later read
--     can compare hashes and treat the stored translation as stale (the
--     `translation_status` column also supports an explicit `'stale'` value
--     for a background/manual process to set, but nothing in this migration
--     auto-recomputes it -- see the report for the "not yet automated" list).
--   * One row per (tenant, entity, field, target language) -- upsert
--     semantics, not a growing history table. A `reviewed`/manually-edited
--     translation is never silently overwritten: the write facade (0040)
--     requires an explicit `force` flag to replace one, and the underlying
--     UPDATE always requires `translation_status <> 'reviewed'` unless that
--     flag is passed as `true`.
-- ============================================================================

create schema if not exists content;

create table if not exists content.translations (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references core.tenants(id) on delete cascade,
  -- No location_id: translations are tenant-wide reference content, same
  -- posture as workforce.recipes when location_id is null.
  source_entity_type    text not null
                          check (source_entity_type in (
                            'workforce_recipe',
                            'workforce_recipe_ingredient',
                            'workforce_recipe_step',
                            'workforce_recipe_note'
                          )),
  -- Deliberately no FK -- see header note.
  source_entity_id      uuid not null,
  source_field          text not null
                          check (source_field in (
                            'title', 'description',      -- workforce_recipe
                            'label',                      -- workforce_recipe_ingredient
                            'instruction',                -- workforce_recipe_step
                            'note_title', 'note_body'      -- workforce_recipe_note
                          )),
  source_language       text not null default 'ja',
  target_language        text not null check (target_language in ('en')),
  translated_text        text not null check (char_length(translated_text) between 1 and 8000),
  translation_status     text not null default 'machine'
                          check (translation_status in ('machine', 'reviewed', 'stale', 'failed')),
  translation_provider    text not null default 'manual'
                          check (translation_provider in ('manual', 'google', 'deepl')),
  source_content_hash     text not null,
  machine_generated       boolean not null default true,
  reviewed_by             uuid references core.users(id),
  reviewed_at             timestamptz,
  translated_by           uuid references core.users(id),
  translated_at           timestamptz not null default clock_timestamp(),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  -- One current translation per (entity, field, target language) -- upsert,
  -- not a growing history. A reviewed/manual edit is protected at the write
  -- facade layer (0040), not by this constraint.
  unique (tenant_id, source_entity_type, source_entity_id, source_field, target_language)
);

create index if not exists content_translations_lookup_idx
  on content.translations(tenant_id, source_entity_type, source_entity_id, source_field, target_language);

comment on table content.translations is
  'Reusable cross-module user-generated-content translation cache/record. Recipes (workforce.recipes/recipe_ingredients/recipe_steps/recipe_notes) is the first consumer; naming and schema placement are deliberately not Recipes- or tenant-specific so future modules (manuals, checklists, inventory item descriptions, knowledge base, booking instructions) can reuse this table unchanged. source_entity_id has no FK (see migration header for why); referential integrity is enforced by content.can_read_translation_source/can_manage_translation_source at the RLS layer.';
comment on column content.translations.source_content_hash is
  'Hash of the source field''s text at the time this translation was produced -- used to detect the source changed since translation (staleness), computed by the caller (0040''s write facade), never trusted as a client-supplied "this is still fresh" flag.';
comment on column content.translations.translation_status is
  'machine (provider-generated, unreviewed) | reviewed (a manager confirmed/edited it -- protected from silent overwrite) | stale (source changed since translation) | failed (a translation attempt errored, no translated_text was produced -- rows in this status are not created by this MVP, reserved for the future automatic-provider slice).';

drop trigger if exists set_updated_at on content.translations;
create trigger set_updated_at before update on content.translations
  for each row execute function core.set_updated_at();

alter table content.translations enable row level security;

-- ----------------------------------------------------------------------------
-- Source-visibility helpers. Both are plain SECURITY INVOKER SQL functions
-- (matching workforce.can_manage_recipe's precedent, 0022): they run as the
-- calling role, so a source row this function cannot even see (filtered by
-- that row's OWN table's RLS) can never resolve to true.
-- ----------------------------------------------------------------------------
create or replace function content.can_read_translation_source(
  p_tenant_id uuid,
  p_source_entity_type text,
  p_source_entity_id uuid
)
returns boolean
language sql
stable
set search_path = core, workforce, public
as $$
  select case p_source_entity_type
    when 'workforce_recipe' then exists (
      select 1 from workforce.recipes r where r.tenant_id = p_tenant_id and r.id = p_source_entity_id
    )
    when 'workforce_recipe_ingredient' then exists (
      select 1 from workforce.recipe_ingredients c where c.tenant_id = p_tenant_id and c.id = p_source_entity_id
    )
    when 'workforce_recipe_step' then exists (
      select 1 from workforce.recipe_steps c where c.tenant_id = p_tenant_id and c.id = p_source_entity_id
    )
    when 'workforce_recipe_note' then exists (
      select 1 from workforce.recipe_notes c where c.tenant_id = p_tenant_id and c.id = p_source_entity_id
    )
    else false
  end;
$$;

comment on function content.can_read_translation_source(uuid, text, uuid) is
  'True when the referenced source row is visible to the caller under its OWN table''s existing RLS (recipe read/manage audience). SECURITY INVOKER: correctness relies on the source table''s own RLS, not on bypassing it.';

revoke all on function content.can_read_translation_source(uuid, text, uuid) from public;
grant execute on function content.can_read_translation_source(uuid, text, uuid) to authenticated;

create or replace function content.can_manage_translation_source(
  p_tenant_id uuid,
  p_source_entity_type text,
  p_source_entity_id uuid
)
returns boolean
language sql
stable
set search_path = core, workforce, public
as $$
  select case p_source_entity_type
    when 'workforce_recipe' then workforce.can_manage_recipe(p_source_entity_id)
    when 'workforce_recipe_ingredient' then exists (
      select 1 from workforce.recipe_ingredients c
      where c.tenant_id = p_tenant_id and c.id = p_source_entity_id
        and workforce.can_manage_recipe(c.recipe_id)
    )
    when 'workforce_recipe_step' then exists (
      select 1 from workforce.recipe_steps c
      where c.tenant_id = p_tenant_id and c.id = p_source_entity_id
        and workforce.can_manage_recipe(c.recipe_id)
    )
    when 'workforce_recipe_note' then exists (
      select 1 from workforce.recipe_notes c
      where c.tenant_id = p_tenant_id and c.id = p_source_entity_id
        and workforce.can_manage_recipe(c.recipe_id)
    )
    else false
  end;
$$;

comment on function content.can_manage_translation_source(uuid, text, uuid) is
  'True when the caller holds workforce.recipe.manage applicable to the recipe that owns this source row (the recipe itself, or the parent recipe of an ingredient/step/note). Manager-only write gate for content.translations.';

revoke all on function content.can_manage_translation_source(uuid, text, uuid) from public;
grant execute on function content.can_manage_translation_source(uuid, text, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- RLS policies
-- ----------------------------------------------------------------------------
create policy content_translations_select on content.translations
  for select
  using (content.can_read_translation_source(tenant_id, source_entity_type, source_entity_id));

create policy content_translations_insert on content.translations
  for insert
  with check (content.can_manage_translation_source(tenant_id, source_entity_type, source_entity_id));

create policy content_translations_update on content.translations
  for update
  using (content.can_manage_translation_source(tenant_id, source_entity_type, source_entity_id))
  with check (content.can_manage_translation_source(tenant_id, source_entity_type, source_entity_id));

-- No DELETE policy: a translation is retired by replacing it (UPDATE), never
-- hard-deleted, matching this codebase's soft-retirement convention.
