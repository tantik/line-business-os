-- ============================================================================
-- 0058  Recipes: explicit bilingual original_language + direction-aware
--       content translation (forward-only; extends 0021/0039/0040/0041/
--       0042/0047/0051 without editing any of them)
-- ----------------------------------------------------------------------------
-- PROBLEM: recipe authoring/translation was hardcoded ja(human) -> en
-- (machine) by construction -- workforce.recipes had no language column at
-- all, content.translations.target_language was CHECK-constrained to only
-- 'en', and every translation RPC/helper hardcoded the literal 'ja' as
-- source and/or 'en' as target.
--
-- FIX: every recipe now carries an explicit `original_language` ('ja' or
-- 'en'). Translation always flows FROM that recipe's original_language TO
-- the other one -- never guessed per field (mixed JA/EN business content
-- inside one recipe, e.g. "Matcha Latte" / "牛乳 200ml", is normal and must
-- never cause a per-field direction switch).
--
-- BACKWARD COMPATIBILITY: existing recipes get `original_language` default
-- 'ja' (the implicit assumption every recipe already had). This is a pure
-- column addition with a default -- no existing row is rewritten in a way
-- that changes its meaning. The target_language CHECK widens from ('en') to
-- ('ja','en'); every existing content.translations row already has
-- target_language = 'en', which trivially still satisfies the widened CHECK
-- -- no existing row needs to change and none is touched by this migration.
--
-- SOURCE-LANGUAGE-CHANGE RULE (implemented once, consistently, here and only
-- here -- see api.upsert_workforce_recipe below): changing an EXISTING
-- recipe's original_language requires the caller to pass
-- p_confirm_language_change = true, otherwise the RPC raises
-- 'recipe_language_change_requires_confirmation' (P0001) and nothing is
-- written. On a confirmed change, the human-authored *_ja/*_en column
-- content is NEVER modified or cleared by the change itself, and every
-- existing content.translations row for that recipe (and its ingredients/
-- steps/notes) is flipped to translation_status = 'stale' (never deleted,
-- never silently trusted as current) so the next Save re-evaluates them
-- under the new direction. A brand-new recipe (p_recipe_id is null) never
-- needs confirmation -- there is no prior direction or content to protect.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. workforce.recipes.original_language
-- ----------------------------------------------------------------------------
alter table workforce.recipes
  add column original_language text not null default 'ja'
    check (original_language in ('ja', 'en'));

comment on column workforce.recipes.original_language is
  'The language this recipe''s human-authored content was written in (ja or en). Translation always flows FROM this language TO the other one -- a single recipe-level setting, never guessed per field. Existing recipes default to ja (the historical implicit assumption).';

-- title_ja/label_ja/instruction_ja/body_ja were `not null` under the old
-- ja-is-always-the-source assumption. An en-original recipe has no human JA
-- content for these columns (its human content lives in the *_en sibling
-- instead) -- these must become nullable so an en-original recipe can be
-- saved at all. The corresponding *_en columns were already nullable.
alter table workforce.recipes alter column title_ja drop not null;
alter table workforce.recipe_ingredients alter column label_ja drop not null;
alter table workforce.recipe_steps alter column instruction_ja drop not null;
alter table workforce.recipe_notes alter column body_ja drop not null;

-- The human-authored side (matching original_language) must always be
-- present; the other side may legitimately be empty until translated.
-- Enforced here as a real CHECK on workforce.recipes (single table, cheap);
-- the child tables have no language column of their own (they inherit
-- direction from their parent recipe) so the equivalent invariant for them
-- is enforced by api.upsert_workforce_recipe below, the only write path.
alter table workforce.recipes
  add constraint recipes_original_language_content_present check (
    (original_language = 'ja' and title_ja is not null and btrim(title_ja) <> '')
    or
    (original_language = 'en' and title_en is not null and btrim(title_en) <> '')
  );

-- ----------------------------------------------------------------------------
-- 2. content.translations.target_language: widen 'en'-only -> ('ja','en')
-- ----------------------------------------------------------------------------
alter table content.translations
  drop constraint translations_target_language_check,
  add constraint translations_target_language_check
    check (target_language in ('ja', 'en'));

-- ----------------------------------------------------------------------------
-- 3. content.recipe_original_language -- resolves the OWNING recipe's
--    original_language for any of the four source_entity_types, so the
--    functions below can pick the correct source/target column pair without
--    duplicating this join four times each. SECURITY INVOKER SQL, matching
--    content.can_read_translation_source's precedent (0039): runs as the
--    calling role, so a row this cannot see (filtered by workforce.recipes'
--    own RLS) resolves to null, never a guessed direction.
-- ----------------------------------------------------------------------------
create or replace function content.recipe_original_language(
  p_tenant_id uuid,
  p_source_entity_type text,
  p_source_entity_id uuid
)
returns text
language sql
stable
security invoker
set search_path = workforce, public
as $$
  select case p_source_entity_type
    when 'workforce_recipe' then (
      select r.original_language from workforce.recipes r
      where r.tenant_id = p_tenant_id and r.id = p_source_entity_id
    )
    when 'workforce_recipe_ingredient' then (
      select r.original_language from workforce.recipes r
      join workforce.recipe_ingredients i
        on i.tenant_id = r.tenant_id and i.recipe_id = r.id
      where r.tenant_id = p_tenant_id and i.id = p_source_entity_id
    )
    when 'workforce_recipe_step' then (
      select r.original_language from workforce.recipes r
      join workforce.recipe_steps s
        on s.tenant_id = r.tenant_id and s.recipe_id = r.id
      where r.tenant_id = p_tenant_id and s.id = p_source_entity_id
    )
    when 'workforce_recipe_note' then (
      select r.original_language from workforce.recipes r
      join workforce.recipe_notes n
        on n.tenant_id = r.tenant_id and n.recipe_id = r.id
      where r.tenant_id = p_tenant_id and n.id = p_source_entity_id
    )
    else null
  end;
$$;

comment on function content.recipe_original_language(uuid, text, uuid) is
  'Resolves the original_language of the recipe that owns this source row (the recipe itself, or the parent recipe of an ingredient/step/note). Returns null if the row is not visible under its own table''s RLS -- never guessed. Drives which column pair (content.translation_source_text) and which target_language (the write RPCs below) apply.';

revoke all on function content.recipe_original_language(uuid, text, uuid) from public;
grant execute on function content.recipe_original_language(uuid, text, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. content.translation_source_text -- was hardcoded to always read the
--    *_ja column (0042). Now direction-aware: reads whichever column pair
--    matches the owning recipe's original_language.
-- ----------------------------------------------------------------------------
create or replace function content.translation_source_text(
  p_tenant_id uuid,
  p_source_entity_type text,
  p_source_entity_id uuid,
  p_source_field text
)
returns text
language sql
stable
security invoker
set search_path = workforce, content, public
as $$
  select case
    when content.recipe_original_language(p_tenant_id, p_source_entity_type, p_source_entity_id) = 'en' then
      case
        when p_source_entity_type = 'workforce_recipe' and p_source_field = 'title'
          then (select r.title_en from workforce.recipes r
                where r.tenant_id = p_tenant_id and r.id = p_source_entity_id)
        when p_source_entity_type = 'workforce_recipe' and p_source_field = 'description'
          then (select r.description_en from workforce.recipes r
                where r.tenant_id = p_tenant_id and r.id = p_source_entity_id)
        when p_source_entity_type = 'workforce_recipe_ingredient' and p_source_field = 'label'
          then (select i.label_en from workforce.recipe_ingredients i
                where i.tenant_id = p_tenant_id and i.id = p_source_entity_id)
        when p_source_entity_type = 'workforce_recipe_step' and p_source_field = 'instruction'
          then (select s.instruction_en from workforce.recipe_steps s
                where s.tenant_id = p_tenant_id and s.id = p_source_entity_id)
        when p_source_entity_type = 'workforce_recipe_note' and p_source_field = 'note_title'
          then (select n.title_en from workforce.recipe_notes n
                where n.tenant_id = p_tenant_id and n.id = p_source_entity_id)
        when p_source_entity_type = 'workforce_recipe_note' and p_source_field = 'note_body'
          then (select n.body_en from workforce.recipe_notes n
                where n.tenant_id = p_tenant_id and n.id = p_source_entity_id)
        else null
      end
    else
      -- Default/'ja' branch -- also the fallback when the owning recipe
      -- cannot be resolved (not visible / not found), matching this
      -- function's pre-existing (0042) behaviour exactly for that case.
      case
        when p_source_entity_type = 'workforce_recipe' and p_source_field = 'title'
          then (select r.title_ja from workforce.recipes r
                where r.tenant_id = p_tenant_id and r.id = p_source_entity_id)
        when p_source_entity_type = 'workforce_recipe' and p_source_field = 'description'
          then (select r.description_ja from workforce.recipes r
                where r.tenant_id = p_tenant_id and r.id = p_source_entity_id)
        when p_source_entity_type = 'workforce_recipe_ingredient' and p_source_field = 'label'
          then (select i.label_ja from workforce.recipe_ingredients i
                where i.tenant_id = p_tenant_id and i.id = p_source_entity_id)
        when p_source_entity_type = 'workforce_recipe_step' and p_source_field = 'instruction'
          then (select s.instruction_ja from workforce.recipe_steps s
                where s.tenant_id = p_tenant_id and s.id = p_source_entity_id)
        when p_source_entity_type = 'workforce_recipe_note' and p_source_field = 'note_title'
          then (select n.title_ja from workforce.recipe_notes n
                where n.tenant_id = p_tenant_id and n.id = p_source_entity_id)
        when p_source_entity_type = 'workforce_recipe_note' and p_source_field = 'note_body'
          then (select n.body_ja from workforce.recipe_notes n
                where n.tenant_id = p_tenant_id and n.id = p_source_entity_id)
        else null
      end
  end;
$$;

-- ----------------------------------------------------------------------------
-- 5. api.set_content_translation -- manual (Manager-authored) upsert.
--    Was hardcoded to insert source_language literal 'ja'. Now stamps the
--    owning recipe's actual original_language. p_target_language stays an
--    explicit caller-supplied argument (a Manager may manually author/edit
--    either language's target text), the CHECK widened in step 2 is the
--    only reason 'ja' is now an accepted value here too.
-- ----------------------------------------------------------------------------
create or replace function api.set_content_translation(
  p_tenant_id uuid,
  p_source_entity_type text,
  p_source_entity_id uuid,
  p_source_field text,
  p_target_language text,
  p_translated_text text,
  p_source_content_hash text,
  p_force boolean default false
)
returns table (
  translation_id uuid,
  translation_status text,
  updated_at timestamptz
)
language plpgsql
security invoker
set search_path = core, content, public
as $$
declare
  v_existing_status text;
  v_source_text text;
  v_trusted_hash text;
  v_source_language text;
begin
  v_source_text := content.translation_source_text(
    p_tenant_id, p_source_entity_type, p_source_entity_id, p_source_field
  );
  if v_source_text is null or btrim(v_source_text) = '' then
    raise exception 'content_translation_source_not_found' using errcode = 'P0001';
  end if;
  v_trusted_hash := encode(extensions.digest(convert_to(btrim(v_source_text), 'UTF8'), 'sha256'), 'hex');
  v_source_language := coalesce(
    content.recipe_original_language(p_tenant_id, p_source_entity_type, p_source_entity_id), 'ja'
  );

  select ct.translation_status into v_existing_status
  from content.translations ct
  where ct.tenant_id = p_tenant_id
    and ct.source_entity_type = p_source_entity_type
    and ct.source_entity_id = p_source_entity_id
    and ct.source_field = p_source_field
    and ct.target_language = p_target_language;

  if v_existing_status = 'reviewed' and not p_force then
    raise exception 'content_translation_requires_force' using errcode = 'P0001';
  end if;

  return query
  insert into content.translations as ct (
    tenant_id, source_entity_type, source_entity_id, source_field,
    source_language, target_language, translated_text,
    translation_status, translation_provider, source_content_hash,
    machine_generated, reviewed_by, reviewed_at, translated_by, translated_at
  ) values (
    p_tenant_id, p_source_entity_type, p_source_entity_id, p_source_field,
    v_source_language, p_target_language, p_translated_text,
    'reviewed', 'manual', v_trusted_hash,
    false, core.current_user_id(), now(), core.current_user_id(), clock_timestamp()
  )
  on conflict (tenant_id, source_entity_type, source_entity_id, source_field, target_language)
  do update set
    translated_text = excluded.translated_text,
    translation_status = 'reviewed',
    translation_provider = 'manual',
    source_content_hash = excluded.source_content_hash,
    machine_generated = false,
    reviewed_by = excluded.reviewed_by,
    reviewed_at = excluded.reviewed_at,
    translated_by = excluded.translated_by,
    translated_at = excluded.translated_at
  returning ct.id, ct.translation_status, ct.updated_at;
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. api.set_machine_content_translation_confirmed -- was hardcoded to
--    always write source_language='ja', target_language='en'. Now derives
--    BOTH from the owning recipe's original_language: source = original
--    language, target = the other one. No new parameter needed -- the
--    direction is never client-supplied, it is re-derived server-side from
--    the same trusted source the hash already comes from, so a caller
--    cannot desync source/target by passing inconsistent arguments.
-- ----------------------------------------------------------------------------
create or replace function api.set_machine_content_translation_confirmed(
  p_tenant_id uuid,
  p_source_entity_type text,
  p_source_entity_id uuid,
  p_source_field text,
  p_translated_text text,
  p_source_content_hash text,
  p_replace_reviewed boolean default false,
  p_translation_provider text default 'deepl'
)
returns table (
  translation_id uuid,
  translation_status text,
  updated_at timestamptz
)
language plpgsql
security invoker
set search_path = core, content, public
as $$
declare
  v_existing_status text;
  v_source_text text;
  v_trusted_hash text;
  v_source_language text;
  v_target_language text;
begin
  v_source_text := content.translation_source_text(
    p_tenant_id, p_source_entity_type, p_source_entity_id, p_source_field
  );
  if v_source_text is null or btrim(v_source_text) = '' then
    raise exception 'content_translation_source_not_found' using errcode = 'P0001';
  end if;
  v_trusted_hash := encode(extensions.digest(convert_to(btrim(v_source_text), 'UTF8'), 'sha256'), 'hex');

  v_source_language := coalesce(
    content.recipe_original_language(p_tenant_id, p_source_entity_type, p_source_entity_id), 'ja'
  );
  v_target_language := case when v_source_language = 'en' then 'ja' else 'en' end;

  select ct.translation_status into v_existing_status
  from content.translations ct
  where ct.tenant_id = p_tenant_id
    and ct.source_entity_type = p_source_entity_type
    and ct.source_entity_id = p_source_entity_id
    and ct.source_field = p_source_field
    and ct.target_language = v_target_language;

  if v_existing_status = 'reviewed' and not p_replace_reviewed then
    raise exception 'content_translation_requires_force' using errcode = 'P0001';
  end if;

  return query
  insert into content.translations as ct (
    tenant_id, source_entity_type, source_entity_id, source_field,
    source_language, target_language, translated_text,
    translation_status, translation_provider, source_content_hash,
    machine_generated, reviewed_by, reviewed_at, translated_by, translated_at
  ) values (
    p_tenant_id, p_source_entity_type, p_source_entity_id, p_source_field,
    v_source_language, v_target_language, p_translated_text,
    'machine', p_translation_provider, v_trusted_hash,
    true, null, null, core.current_user_id(), clock_timestamp()
  )
  on conflict (tenant_id, source_entity_type, source_entity_id, source_field, target_language)
  do update set
    translated_text = excluded.translated_text,
    translation_status = 'machine',
    translation_provider = excluded.translation_provider,
    source_content_hash = excluded.source_content_hash,
    machine_generated = true,
    reviewed_by = null,
    reviewed_at = null,
    translated_by = excluded.translated_by,
    translated_at = excluded.translated_at
  returning ct.id, ct.translation_status, ct.updated_at;
end;
$$;

comment on function api.set_machine_content_translation_confirmed(uuid, text, uuid, text, text, text, boolean, text) is
  'Automatic (provider-generated) translation upsert. source_language/target_language are both derived server-side from the owning recipe''s original_language (source = original_language, target = the other language) -- never client-supplied, so a caller cannot desync direction from the actual recipe. Always sets translation_status=machine, machine_generated=true, clears any prior reviewed_by/reviewed_at. Refuses (P0001) to replace an existing reviewed translation unless p_replace_reviewed=true.';

-- ----------------------------------------------------------------------------
-- 7. api.workforce_recipes view -- expose original_language.
-- ----------------------------------------------------------------------------
create or replace view api.workforce_recipes
  with (security_invoker = true) as
select
  r.id as recipe_id, r.tenant_id, r.location_id, r.recipe_category_id,
  r.title_ja, r.title_en, r.description_ja, r.description_en,
  r.is_popular, r.status, r.created_at, r.updated_at, r.content_kind,
  r.media_path, r.original_language
from workforce.recipes r;

comment on view api.workforce_recipes is
  'Published recipe and instruction knowledge content. Existing recipe RLS remains authoritative. media_path is opaque and resolved to a signed URL server-side. original_language (ja|en) is the recipe''s human-authored source language; translation always flows from it to the other language.';

revoke all on api.workforce_recipes from anon, public;
grant select on api.workforce_recipes to authenticated;
-- original_language is set only through api.upsert_workforce_recipe (see
-- below), never via a direct column-level PATCH -- no `grant update
-- (original_language)` is added here, matching content_kind's own posture
-- (0033) of routing sensitive-field changes through validated RPC logic
-- rather than a raw column grant.

-- ----------------------------------------------------------------------------
-- 8. api.upsert_workforce_recipe -- direction-aware authoring RPC.
--    Old 12-arg signature is dropped (not replaced in place) because two new
--    parameters change the argument-type signature -- see 0047's header note
--    for why `create or replace` alone would leave both overloads resolvable
--    and ambiguous instead of replacing the old one.
--
--    p_title/p_description/ingredient & step text/p_note_title/p_note_body
--    are now generic "the source-language text" (renamed from the old
--    *_ja-only names) -- written into the *_ja or *_en column matching
--    p_original_language; the OTHER column is never touched by this RPC, so
--    switching original_language back and forth never destroys either
--    side's human content.
--
--    Source-language-change rule (see migration header): changing
--    original_language on an EXISTING recipe requires
--    p_confirm_language_change = true, otherwise this raises
--    'recipe_language_change_requires_confirmation' (P0001) before writing
--    anything. On a confirmed change, every content.translations row for
--    this recipe and its current ingredients/steps/notes is flipped to
--    'stale' (never deleted) so it is re-evaluated, never silently trusted,
--    under the new direction.
-- ----------------------------------------------------------------------------
drop function if exists api.upsert_workforce_recipe(
  uuid, uuid, uuid, text, text, text, text, jsonb, jsonb, text, text, text
);

create or replace function api.upsert_workforce_recipe(
  p_tenant_id uuid,
  p_location_id uuid,
  p_recipe_id uuid,
  p_content_kind text,
  p_title text,
  p_description text,
  p_status text,
  p_ingredients jsonb,
  p_steps jsonb,
  p_note_title text,
  p_note_body text,
  p_media_path text,
  p_original_language text default 'ja',
  p_confirm_language_change boolean default false
)
returns uuid
language plpgsql
security invoker
set search_path = core, content, workforce, public
as $$
declare
  v_recipe_id uuid;
  v_index integer;
  v_text text;
  v_existing_id uuid;
  v_keep uuid[] := array[]::uuid[];
  v_existing_language text;
  v_stale_entity_ids uuid[];
begin
  if p_content_kind not in ('recipe', 'instruction')
     or p_status not in ('draft', 'published')
     or p_original_language not in ('ja', 'en')
     or length(btrim(p_title)) not between 1 and 160
     or p_ingredients is null or jsonb_typeof(p_ingredients) <> 'array'
     or p_steps is null or jsonb_typeof(p_steps) <> 'array'
     or jsonb_array_length(p_ingredients) > 100
     or jsonb_array_length(p_steps) > 100
     or (p_media_path is not null and (length(p_media_path) > 500 or p_media_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$')) then
    raise exception 'recipe_invalid_input' using errcode = '22023';
  end if;

  if p_recipe_id is not null then
    select r.original_language into v_existing_language
    from workforce.recipes r
    where r.tenant_id = p_tenant_id and r.id = p_recipe_id;
    if v_existing_language is not null and v_existing_language <> p_original_language
       and not p_confirm_language_change then
      raise exception 'recipe_language_change_requires_confirmation' using errcode = 'P0001';
    end if;
  end if;

  if p_recipe_id is null then
    if p_original_language = 'ja' then
      insert into workforce.recipes
        (tenant_id, location_id, title_ja, description_ja, content_kind, status, media_path, original_language, created_by, updated_by)
      values
        (p_tenant_id, p_location_id, btrim(p_title), nullif(btrim(p_description), ''),
         p_content_kind, p_status, p_media_path, 'ja', core.current_user_id(), core.current_user_id())
      returning id into v_recipe_id;
    else
      insert into workforce.recipes
        (tenant_id, location_id, title_en, description_en, content_kind, status, media_path, original_language, created_by, updated_by)
      values
        (p_tenant_id, p_location_id, btrim(p_title), nullif(btrim(p_description), ''),
         p_content_kind, p_status, p_media_path, 'en', core.current_user_id(), core.current_user_id())
      returning id into v_recipe_id;
    end if;
  else
    if p_original_language = 'ja' then
      update workforce.recipes r
         set title_ja = btrim(p_title),
             description_ja = nullif(btrim(p_description), ''),
             content_kind = p_content_kind,
             status = p_status,
             media_path = p_media_path,
             original_language = 'ja',
             updated_by = core.current_user_id()
       where r.tenant_id = p_tenant_id
         and r.location_id = p_location_id
         and r.id = p_recipe_id
      returning r.id into v_recipe_id;
    else
      update workforce.recipes r
         set title_en = btrim(p_title),
             description_en = nullif(btrim(p_description), ''),
             content_kind = p_content_kind,
             status = p_status,
             media_path = p_media_path,
             original_language = 'en',
             updated_by = core.current_user_id()
       where r.tenant_id = p_tenant_id
         and r.location_id = p_location_id
         and r.id = p_recipe_id
      returning r.id into v_recipe_id;
    end if;
    if v_recipe_id is null then raise exception 'recipe_not_found' using errcode = 'P0001'; end if;
  end if;

  v_keep := array[]::uuid[];
  if jsonb_array_length(p_ingredients) > 0 then
  for v_index in 0..jsonb_array_length(p_ingredients) - 1 loop
    v_text := btrim(p_ingredients ->> v_index);
    if length(v_text) not between 1 and 500 then raise exception 'recipe_invalid_ingredient' using errcode = '22023'; end if;
    select i.id into v_existing_id from workforce.recipe_ingredients i
     where i.tenant_id = p_tenant_id and i.recipe_id = v_recipe_id
     order by i.sort_order, i.id offset v_index limit 1;
    if v_existing_id is null then
      if p_original_language = 'ja' then
        insert into workforce.recipe_ingredients (tenant_id, recipe_id, label_ja, sort_order)
        values (p_tenant_id, v_recipe_id, v_text, v_index) returning id into v_existing_id;
      else
        insert into workforce.recipe_ingredients (tenant_id, recipe_id, label_en, sort_order)
        values (p_tenant_id, v_recipe_id, v_text, v_index) returning id into v_existing_id;
      end if;
    else
      if p_original_language = 'ja' then
        update workforce.recipe_ingredients set label_ja = v_text, sort_order = v_index where id = v_existing_id;
      else
        update workforce.recipe_ingredients set label_en = v_text, sort_order = v_index where id = v_existing_id;
      end if;
    end if;
    v_keep := array_append(v_keep, v_existing_id);
    v_existing_id := null;
  end loop;
  end if;
  delete from workforce.recipe_ingredients
   where tenant_id = p_tenant_id and recipe_id = v_recipe_id and not (id = any(v_keep));

  v_keep := array[]::uuid[];
  if jsonb_array_length(p_steps) > 0 then
  for v_index in 0..jsonb_array_length(p_steps) - 1 loop
    v_text := btrim(p_steps ->> v_index);
    if length(v_text) not between 1 and 2000 then raise exception 'recipe_invalid_step' using errcode = '22023'; end if;
    select s.id into v_existing_id from workforce.recipe_steps s
     where s.tenant_id = p_tenant_id and s.recipe_id = v_recipe_id
     order by s.step_number, s.id offset v_index limit 1;
    if v_existing_id is null then
      if p_original_language = 'ja' then
        insert into workforce.recipe_steps (tenant_id, recipe_id, instruction_ja, step_number)
        values (p_tenant_id, v_recipe_id, v_text, v_index + 1) returning id into v_existing_id;
      else
        insert into workforce.recipe_steps (tenant_id, recipe_id, instruction_en, step_number)
        values (p_tenant_id, v_recipe_id, v_text, v_index + 1) returning id into v_existing_id;
      end if;
    else
      if p_original_language = 'ja' then
        update workforce.recipe_steps set instruction_ja = v_text, step_number = v_index + 1 where id = v_existing_id;
      else
        update workforce.recipe_steps set instruction_en = v_text, step_number = v_index + 1 where id = v_existing_id;
      end if;
    end if;
    v_keep := array_append(v_keep, v_existing_id);
    v_existing_id := null;
  end loop;
  end if;
  delete from workforce.recipe_steps
   where tenant_id = p_tenant_id and recipe_id = v_recipe_id and not (id = any(v_keep));

  if nullif(btrim(p_note_body), '') is null then
    delete from workforce.recipe_notes where tenant_id = p_tenant_id and recipe_id = v_recipe_id;
  else
    select n.id into v_existing_id from workforce.recipe_notes n
     where n.tenant_id = p_tenant_id and n.recipe_id = v_recipe_id order by n.id limit 1;
    if v_existing_id is null then
      if p_original_language = 'ja' then
        insert into workforce.recipe_notes (tenant_id, recipe_id, title_ja, body_ja)
        values (p_tenant_id, v_recipe_id, nullif(btrim(p_note_title), ''), btrim(p_note_body));
      else
        insert into workforce.recipe_notes (tenant_id, recipe_id, title_en, body_en)
        values (p_tenant_id, v_recipe_id, nullif(btrim(p_note_title), ''), btrim(p_note_body));
      end if;
    else
      if p_original_language = 'ja' then
        update workforce.recipe_notes set title_ja = nullif(btrim(p_note_title), ''), body_ja = btrim(p_note_body)
         where id = v_existing_id;
      else
        update workforce.recipe_notes set title_en = nullif(btrim(p_note_title), ''), body_en = btrim(p_note_body)
         where id = v_existing_id;
      end if;
      delete from workforce.recipe_notes where tenant_id = p_tenant_id and recipe_id = v_recipe_id and id <> v_existing_id;
    end if;
  end if;

  -- Confirmed language-change: never touch the *_ja/*_en columns beyond the
  -- normal save above (already handled -- the OTHER language's column was
  -- never included in any SET/INSERT list this call, so it is untouched by
  -- construction). Force every existing translation row for this recipe and
  -- its current children to be re-evaluated, not silently trusted or
  -- destroyed.
  if v_existing_language is not null and v_existing_language <> p_original_language and p_confirm_language_change then
    select array_agg(id) into v_stale_entity_ids from (
      select v_recipe_id as id
      union all select id from workforce.recipe_ingredients where tenant_id = p_tenant_id and recipe_id = v_recipe_id
      union all select id from workforce.recipe_steps where tenant_id = p_tenant_id and recipe_id = v_recipe_id
      union all select id from workforce.recipe_notes where tenant_id = p_tenant_id and recipe_id = v_recipe_id
    ) ids;
    update content.translations
       set translation_status = 'stale'
     where tenant_id = p_tenant_id
       and source_entity_id = any(v_stale_entity_ids)
       and translation_status <> 'stale';
  end if;

  return v_recipe_id;
end;
$$;

revoke all on function api.upsert_workforce_recipe(uuid, uuid, uuid, text, text, text, text, jsonb, jsonb, text, text, text, text, boolean) from public;
grant execute on function api.upsert_workforce_recipe(uuid, uuid, uuid, text, text, text, text, jsonb, jsonb, text, text, text, text, boolean) to authenticated;

-- SECURITY INVOKER RPC needs update privilege on content.translations for
-- the language-change staleness sweep above (insert/select were already
-- granted, 0042/0051).
grant update on content.translations to authenticated;
