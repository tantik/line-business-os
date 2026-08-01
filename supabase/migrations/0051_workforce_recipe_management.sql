-- Cafe v2.1: transactional recipe authoring through an app-facing RPC.

alter table workforce.recipes add column media_path text;
comment on column workforce.recipes.media_path is 'Opaque path in the private recipe-media bucket. Never a public URL.';

create or replace view api.workforce_recipes
  with (security_invoker = true) as
select
  r.id as recipe_id, r.tenant_id, r.location_id, r.recipe_category_id,
  r.title_ja, r.title_en, r.description_ja, r.description_en,
  r.is_popular, r.status, r.created_at, r.updated_at, r.content_kind,
  r.media_path
from workforce.recipes r;

comment on view api.workforce_recipes is
  'Published recipe and instruction knowledge content. Existing recipe RLS remains authoritative. media_path is opaque and resolved to a signed URL server-side.';

revoke all on api.workforce_recipes from anon, public;
grant select on api.workforce_recipes to authenticated;

-- SECURITY INVOKER: the existing recipe/child RLS policies remain the
-- authorization boundary. Publishing additionally requires recipe.publish.
create or replace function api.upsert_workforce_recipe(
  p_tenant_id uuid,
  p_location_id uuid,
  p_recipe_id uuid,
  p_content_kind text,
  p_title_ja text,
  p_description_ja text,
  p_status text,
  p_ingredients jsonb,
  p_steps jsonb,
  p_note_title text,
  p_note_body text,
  p_media_path text
)
returns uuid
language plpgsql
security invoker
set search_path = core, workforce, public
as $$
declare
  v_recipe_id uuid;
  v_index integer;
  v_text text;
  v_existing_id uuid;
  v_keep uuid[] := array[]::uuid[];
begin
  if p_content_kind not in ('recipe', 'instruction')
     or p_status not in ('draft', 'published')
     or length(btrim(p_title_ja)) not between 1 and 160
     or p_ingredients is null or jsonb_typeof(p_ingredients) <> 'array'
     or p_steps is null or jsonb_typeof(p_steps) <> 'array'
     or jsonb_array_length(p_ingredients) > 100
     or jsonb_array_length(p_steps) > 100
     or (p_media_path is not null and (length(p_media_path) > 500 or p_media_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$')) then
    raise exception 'recipe_invalid_input' using errcode = '22023';
  end if;

  if p_recipe_id is null then
    insert into workforce.recipes
      (tenant_id, location_id, title_ja, description_ja, content_kind, status, media_path, created_by, updated_by)
    values
      (p_tenant_id, p_location_id, btrim(p_title_ja), nullif(btrim(p_description_ja), ''),
       p_content_kind, p_status, p_media_path, core.current_user_id(), core.current_user_id())
    returning id into v_recipe_id;
  else
    update workforce.recipes r
       set title_ja = btrim(p_title_ja),
           description_ja = nullif(btrim(p_description_ja), ''),
           content_kind = p_content_kind,
           status = p_status,
           media_path = p_media_path,
           updated_by = core.current_user_id()
     where r.tenant_id = p_tenant_id
       and r.location_id = p_location_id
       and r.id = p_recipe_id
    returning r.id into v_recipe_id;
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
      insert into workforce.recipe_ingredients (tenant_id, recipe_id, label_ja, sort_order)
      values (p_tenant_id, v_recipe_id, v_text, v_index) returning id into v_existing_id;
    else
      update workforce.recipe_ingredients set label_ja = v_text, sort_order = v_index where id = v_existing_id;
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
      insert into workforce.recipe_steps (tenant_id, recipe_id, instruction_ja, step_number)
      values (p_tenant_id, v_recipe_id, v_text, v_index + 1) returning id into v_existing_id;
    else
      update workforce.recipe_steps set instruction_ja = v_text, step_number = v_index + 1 where id = v_existing_id;
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
      insert into workforce.recipe_notes (tenant_id, recipe_id, title_ja, body_ja)
      values (p_tenant_id, v_recipe_id, nullif(btrim(p_note_title), ''), btrim(p_note_body));
    else
      update workforce.recipe_notes set title_ja = nullif(btrim(p_note_title), ''), body_ja = btrim(p_note_body)
       where id = v_existing_id;
      delete from workforce.recipe_notes where tenant_id = p_tenant_id and recipe_id = v_recipe_id and id <> v_existing_id;
    end if;
  end if;
  return v_recipe_id;
end;
$$;

revoke all on function api.upsert_workforce_recipe(uuid, uuid, uuid, text, text, text, text, jsonb, jsonb, text, text, text) from public;
grant execute on function api.upsert_workforce_recipe(uuid, uuid, uuid, text, text, text, text, jsonb, jsonb, text, text, text) to authenticated;

-- Required by the SECURITY INVOKER RPC; RLS remains authoritative.
grant insert, update on workforce.recipes to authenticated;
grant select, insert, update, delete on workforce.recipe_ingredients to authenticated;
grant select, insert, update, delete on workforce.recipe_steps to authenticated;
grant select, insert, update, delete on workforce.recipe_notes to authenticated;
