-- ============================================================================
-- 0047 Content translation: OpenAI provider support
-- ----------------------------------------------------------------------------
-- Extends 0039/0041/0042's content-translation model to accept a second
-- machine-translation provider ('openai') alongside the existing 'deepl',
-- without touching 0039-0046 (forward-only):
--
--   1. Widen content.translations.translation_provider's CHECK constraint to
--      allow 'openai' -- still an explicit allow-list, never opened to
--      arbitrary strings. 'manual', 'google', 'deepl' remain unchanged.
--   2. Extend api.set_machine_content_translation_confirmed with a new
--      trailing, defaulted p_translation_provider parameter so the caller
--      (apps/web) supplies which provider actually produced the text,
--      instead of this function hardcoding 'deepl'. The default ('deepl')
--      preserves the exact previous behaviour for any caller that omits the
--      argument -- no existing caller is broken.
--   3. Update the legacy 6-arg api.set_machine_content_translation wrapper to
--      keep passing 'deepl' explicitly, so its behaviour is byte-for-byte
--      unchanged (it has no way to know which provider ran; this codebase's
--      current callers only ever use the confirmed RPC directly).
--
-- The CHECK constraint remains the actual database-boundary validation for
-- allowed provider values -- this migration does not duplicate that
-- allow-list inside the function bodies.
--
-- SECURITY INVOKER, search_path, ownership and grants are all unchanged from
-- 0041/0042: RLS (content_translations_insert/_update, gated by
-- content.can_manage_translation_source) remains the real authorization
-- boundary.
-- ============================================================================

alter table content.translations
  drop constraint translations_translation_provider_check,
  add constraint translations_translation_provider_check
    check (translation_provider in ('manual', 'google', 'deepl', 'openai'));

-- Postgres identifies a function by (schema, name, argument-TYPE list), not
-- by name alone -- appending a parameter therefore creates a NEW overload
-- rather than replacing the existing one via `create or replace`. Without
-- this explicit drop, the old 7-arg (hardcoded-'deepl'-only-via-default)
-- signature would keep existing side by side with the new 8-arg one, which
-- both PostgREST's RPC dispatch and any positional caller could resolve
-- ambiguously. Dropping first, then creating the 8-arg version below, keeps
-- exactly one signature in the catalog, matching this migration's "update
-- all callers atomically" requirement.
drop function if exists api.set_machine_content_translation_confirmed(
  uuid, text, uuid, text, text, text, boolean
);

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
  'Automatic (provider-generated) translation upsert, with the caller-supplied p_translation_provider explicitly recorded (defaults to ''deepl'' for backward compatibility). Always sets translation_status=machine, machine_generated=true, and clears any prior reviewed_by/reviewed_at. Refuses (P0001) to replace an existing reviewed translation unless p_replace_reviewed=true. The database ignores any caller-supplied source hash, deriving it fresh from content.translation_source_text. SECURITY INVOKER: content_translations_insert/_update RLS is the real authorization boundary.';

-- The drop above also drops the old signature's grants -- reinstate them on
-- the new 8-arg signature, matching 0042's grant posture exactly.
revoke all on function api.set_machine_content_translation_confirmed(uuid, text, uuid, text, text, text, boolean, text)
  from public;
grant execute on function api.set_machine_content_translation_confirmed(uuid, text, uuid, text, text, text, boolean, text)
  to authenticated;

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
    false,
    'deepl'
  );
$$;

comment on function api.set_machine_content_translation(uuid, text, uuid, text, text, text) is
  'Legacy 6-arg wrapper, unchanged behaviour: always forwards to api.set_machine_content_translation_confirmed with p_replace_reviewed=false and p_translation_provider=''deepl''. Kept for any caller that has not adopted the explicit-provider confirmed RPC.';
