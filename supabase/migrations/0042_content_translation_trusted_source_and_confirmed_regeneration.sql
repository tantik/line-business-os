-- ============================================================================
-- 0042 Content translation hardening
--   1. Derive source hashes inside the database from the visible source row.
--   2. Return a dedicated machine-write RPC with an explicit reviewed-replace
--      confirmation used only for stale reviewed translations.
--   3. Retire direct authenticated access to the older machine RPC whose
--      source hash was caller-supplied.
-- ============================================================================

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
set search_path = workforce, public
as $$
  select case
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
  end;
$$;

revoke all on function content.translation_source_text(uuid, text, uuid, text) from public;
grant execute on function content.translation_source_text(uuid, text, uuid, text) to authenticated;

-- SECURITY INVOKER write RPCs need the underlying table privileges before
-- RLS can evaluate the manager-only source policies. Earlier pgTAP fixtures
-- supplied these grants only inside their rolled-back test transaction,
-- which masked the missing production grant during automated verification.
grant insert, update on content.translations to authenticated;

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
begin
  v_source_text := content.translation_source_text(
    p_tenant_id, p_source_entity_type, p_source_entity_id, p_source_field
  );
  if v_source_text is null or btrim(v_source_text) = '' then
    raise exception 'content_translation_source_not_found' using errcode = 'P0001';
  end if;
  v_trusted_hash := encode(extensions.digest(convert_to(btrim(v_source_text), 'UTF8'), 'sha256'), 'hex');

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
    'ja', p_target_language, p_translated_text,
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

create or replace function api.set_machine_content_translation_confirmed(
  p_tenant_id uuid,
  p_source_entity_type text,
  p_source_entity_id uuid,
  p_source_field text,
  p_translated_text text,
  p_source_content_hash text,
  p_replace_reviewed boolean default false
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
begin
  v_source_text := content.translation_source_text(
    p_tenant_id, p_source_entity_type, p_source_entity_id, p_source_field
  );
  if v_source_text is null or btrim(v_source_text) = '' then
    raise exception 'content_translation_source_not_found' using errcode = 'P0001';
  end if;
  v_trusted_hash := encode(extensions.digest(convert_to(btrim(v_source_text), 'UTF8'), 'sha256'), 'hex');

  select ct.translation_status into v_existing_status
  from content.translations ct
  where ct.tenant_id = p_tenant_id
    and ct.source_entity_type = p_source_entity_type
    and ct.source_entity_id = p_source_entity_id
    and ct.source_field = p_source_field
    and ct.target_language = 'en';

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
    'ja', 'en', p_translated_text,
    'machine', 'deepl', v_trusted_hash,
    true, null, null, core.current_user_id(), clock_timestamp()
  )
  on conflict (tenant_id, source_entity_type, source_entity_id, source_field, target_language)
  do update set
    translated_text = excluded.translated_text,
    translation_status = 'machine',
    translation_provider = 'deepl',
    source_content_hash = excluded.source_content_hash,
    machine_generated = true,
    reviewed_by = null,
    reviewed_at = null,
    translated_by = excluded.translated_by,
    translated_at = excluded.translated_at
  returning ct.id, ct.translation_status, ct.updated_at;
end;
$$;

create or replace function api.set_machine_content_translation(
  p_tenant_id uuid,
  p_source_entity_type text,
  p_source_entity_id uuid,
  p_source_field text,
  p_translated_text text,
  p_source_content_hash text
)
returns table (
  translation_id uuid,
  translation_status text,
  updated_at timestamptz
)
language sql
security invoker
set search_path = api, public
as $$
  select *
  from api.set_machine_content_translation_confirmed(
    p_tenant_id,
    p_source_entity_type,
    p_source_entity_id,
    p_source_field,
    p_translated_text,
    p_source_content_hash,
    false
  );
$$;

revoke all on function api.set_machine_content_translation_confirmed(uuid, text, uuid, text, text, text, boolean)
  from public;
grant execute on function api.set_machine_content_translation_confirmed(uuid, text, uuid, text, text, text, boolean)
  to authenticated;
