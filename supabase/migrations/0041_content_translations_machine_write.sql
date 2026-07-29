-- ============================================================================
-- 0041  Content translations: automatic (machine/provider) write path +
--       reviewed-confirmation RPC
-- ----------------------------------------------------------------------------
-- Extends 0039/0040 (data model + RLS + manual-write RPC) with the two RPCs
-- an automatic translation provider integration needs, without touching
-- 0039/0040 themselves (forward-only):
--
--   * api.set_machine_content_translation -- upsert of a PROVIDER-GENERATED
--     translation. Unlike api.set_content_translation (0040, always manual/
--     reviewed), this always stamps translation_provider/translation_status
--     for the machine path and is never used to author a reviewed
--     translation directly. Same "never silently overwrite a reviewed
--     translation" guarantee as 0040 -- there is deliberately no p_force
--     parameter here: the calling application layer is expected to already
--     have excluded reviewed fields before batching a provider call (see the
--     translation orchestration service), and this RPC enforces that
--     invariant a second time at the DB layer (defense in depth), raising
--     the same P0001 'content_translation_requires_force' error 0040 uses so
--     callers share one error-handling path.
--   * api.mark_content_translation_reviewed -- flips an existing translation
--     (produced by either path) to translation_status='reviewed' without
--     changing translated_text/translation_provider/machine_generated. This
--     is how a Manager confirms a machine translation is correct without
--     re-typing it (the only other way to reach translation_status=
--     'reviewed' is a manual edit through api.set_content_translation).
--
-- SECURITY INVOKER for both, exactly like 0040: RLS
-- (content_translations_insert/_update, gated by
-- content.can_manage_translation_source) is the real authorization
-- boundary, not these functions.
-- ============================================================================

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
    and ct.target_language = 'en';

  -- Defense in depth: the orchestration layer is expected to have already
  -- excluded reviewed fields from any machine-translation batch. There is no
  -- force override here (unlike 0040) -- a reviewed translation can only be
  -- replaced by an explicit manual edit (api.set_content_translation with
  -- p_force=true) or superseded via a fresh review, never by an automatic
  -- provider call.
  if v_existing_status = 'reviewed' then
    raise exception 'content_translation_requires_force'
      using errcode = 'P0001',
            detail = 'An existing reviewed translation cannot be replaced by an automatic translation.';
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
    'machine', 'deepl', p_source_content_hash,
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

comment on function api.set_machine_content_translation(uuid, text, uuid, text, text, text) is
  'Automatic (provider-generated) translation upsert. Always sets translation_status=machine, translation_provider=deepl, machine_generated=true, and clears any prior reviewed_by/reviewed_at. Refuses (P0001) to replace an existing reviewed translation -- no force override exists for the machine path. SECURITY INVOKER: content_translations_insert/_update RLS is the real authorization boundary.';

revoke all on function api.set_machine_content_translation(uuid, text, uuid, text, text, text) from public;
grant execute on function api.set_machine_content_translation(uuid, text, uuid, text, text, text) to authenticated;

create or replace function api.mark_content_translation_reviewed(
  p_tenant_id uuid,
  p_translation_id uuid
)
returns table (
  translation_id uuid,
  translation_status text,
  updated_at timestamptz
)
language sql
security invoker
set search_path = core, content, public
as $$
  update content.translations ct
  set
    translation_status = 'reviewed',
    reviewed_by = core.current_user_id(),
    reviewed_at = clock_timestamp()
  where ct.id = p_translation_id
    and ct.tenant_id = p_tenant_id
  returning ct.id, ct.translation_status, ct.updated_at;
$$;

comment on function api.mark_content_translation_reviewed(uuid, uuid) is
  'Confirms an existing translation (machine or manual) as reviewed, without changing translated_text/translation_provider/machine_generated. Returns zero rows if the id does not exist, belongs to another tenant, or is not visible/manageable under content_translations_update RLS -- indistinguishable at this layer, exactly like every other RLS-filtered read/write in this codebase. SECURITY INVOKER: content_translations_update RLS is the real authorization boundary.';

revoke all on function api.mark_content_translation_reviewed(uuid, uuid) from public;
grant execute on function api.mark_content_translation_reviewed(uuid, uuid) to authenticated;
