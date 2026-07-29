-- ============================================================================
-- 0040  Content translations: API facade (read view + manual-write RPC)
-- ----------------------------------------------------------------------------
-- Read view mirrors 0023/0037's exact pattern (security_invoker, RLS is the
-- real gate, no PII/raw-identity columns -- `translated_by`/`reviewed_by` are
-- core.users ids and are NOT exposed here, matching the "no raw user ids in
-- any api view" convention).
--
-- Write path is a single SECURITY INVOKER RPC,
-- `api.set_content_translation`, not a grant on the view (the view isn't a
-- simple pass-through once a later migration adds more columns, and this
-- function needs conditional logic an auto-updatable view can't express
-- anyway: refusing to silently overwrite a `reviewed` translation).
--
-- MVP SCOPE: this is the only write path in this migration. There is no
-- provider-integration RPC, no background job, and nothing in this codebase
-- calls an external translation API -- see the report's "User-generated
-- content translation" section for what's deferred.
-- ============================================================================

create view api.content_translations
  with (security_invoker = true) as
select
  t.id as translation_id,
  t.tenant_id,
  t.source_entity_type,
  t.source_entity_id,
  t.source_field,
  t.source_language,
  t.target_language,
  t.translated_text,
  t.translation_status,
  t.translation_provider,
  t.source_content_hash,
  t.machine_generated,
  t.reviewed_at,
  t.translated_at,
  t.updated_at
from content.translations t;

comment on view api.content_translations is
  'Content translation records, relying entirely on content_translations_select RLS (source-row visibility) for row access. security_invoker view. No raw user ids (translated_by/reviewed_by) exposed.';

grant usage on schema content to authenticated;
grant select on content.translations to authenticated;
grant select on api.content_translations to authenticated;
revoke all on api.content_translations from anon, public;

-- ----------------------------------------------------------------------------
-- api.set_content_translation -- manual (Manager-authored) translation
-- upsert. SECURITY INVOKER: content_translations_insert/_update RLS
-- (workforce.recipe.manage on the owning recipe) is the real authorization
-- boundary, not this function.
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
begin
  select ct.translation_status into v_existing_status
  from content.translations ct
  where ct.tenant_id = p_tenant_id
    and ct.source_entity_type = p_source_entity_type
    and ct.source_entity_id = p_source_entity_id
    and ct.source_field = p_source_field
    and ct.target_language = p_target_language;

  -- A previously reviewed (human-confirmed) translation is never silently
  -- replaced -- the caller must pass p_force = true, an explicit decision,
  -- never a default.
  if v_existing_status = 'reviewed' and not p_force then
    raise exception 'content_translation_requires_force'
      using errcode = 'P0001',
            detail = 'An existing reviewed translation would be overwritten without an explicit force confirmation.';
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
    'reviewed', 'manual', p_source_content_hash,
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

comment on function api.set_content_translation(uuid, text, uuid, text, text, text, text, boolean) is
  'Manual translation upsert (Manager-authored). Always sets translation_status=reviewed, translation_provider=manual, machine_generated=false -- there is no automatic-provider path in this migration. Refuses (P0001) to replace an existing reviewed translation unless p_force=true. SECURITY INVOKER: content_translations_insert/_update RLS is the real authorization boundary.';

revoke all on function api.set_content_translation(uuid, text, uuid, text, text, text, text, boolean) from public;
grant execute on function api.set_content_translation(uuid, text, uuid, text, text, text, text, boolean) to authenticated;
