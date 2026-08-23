-- ----------------------------------------------------------------------------
-- Allow `api.upsert_workforce_recipe` to accept p_status = 'archived'.
--
-- Bug: the Recipe edit form's own Status dropdown (recipe-form.tsx) has
-- always offered draft/published/archived as options, and always routed
-- every save -- including a status-only change to "Archived" -- through this
-- RPC. But the RPC's input guard (0058) only ever allowed 'draft'/
-- 'published', so selecting "Archived" and saving always raised
-- 'recipe_invalid_input', even though nothing else about the recipe was
-- invalid. (There is a separate `setRecipeArchived` action/RPC for the
-- dedicated Archive button, but the form's own dropdown never used it.)
--
-- Fix: widen the allowed p_status set to match what the form actually
-- offers. Same signature as 0058's version, so `create or replace` in place
-- is sufficient -- no drop/re-grant needed.
-- ----------------------------------------------------------------------------

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
     or p_status not in ('draft', 'published', 'archived')
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
