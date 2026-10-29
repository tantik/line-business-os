-- ============================================================================
-- 0142: api.my_access -- every permission check a page needs, in one RPC
-- (DEBT-124 (2), DEBT-135).
--
-- WHY: a Manager page view made 5 separate permission round-trips
-- (api.has_permission x3, api.has_permission_in_tenant, api.is_tenant_owner),
-- each one a PostgREST request (API-gateway log line, DB call, latency).
-- Measured 2026-10-29: ~45 Supabase requests per Manager view (DEBT-097).
--
-- WHAT: one invoker-only function that answers a caller-supplied list of
-- checks by DELEGATING to the exact same core functions the single-check
-- RPCs use -- no permission logic is re-implemented here, so the answers are
-- identical by construction:
--   p_location_permissions      -> core.has_permission(t, perm, p_location_id)
--                                  (= api.has_permission(t, perm, loc))
--   p_tenant_permissions        -> core.has_permission(t, perm, null)
--                                  (= api.has_permission(t, perm, null):
--                                  tenant-wide assignment only)
--   p_any_location_permissions  -> core.has_permission_in_tenant(t, perm)
--                                  (= api.has_permission_in_tenant)
--   isTenantOwner (always)      -> core.caller_is_tenant_owner(t)
--                                  (= api.is_tenant_owner)
--
-- Result (jsonb):
--   {"location": {"<perm>": bool, ...}, "tenant": {...}, "anyLocation": {...},
--    "isTenantOwner": bool}
--
-- SECURITY MODEL: NOT SECURITY DEFINER (ADR 0008), same as 0019/0066/0140:
-- the wrapper only calls already-granted core functions. It reveals nothing
-- the caller could not already learn by calling the single-check RPCs one by
-- one: booleans about the CALLER's own access, no rows. Each list is capped
-- (64 entries) so one call cannot be turned into an unbounded loop.
-- `anon` gets no grant.
-- ============================================================================

create or replace function api.my_access(
  p_tenant_id uuid,
  p_location_id uuid default null,
  p_location_permissions text[] default '{}',
  p_tenant_permissions text[] default '{}',
  p_any_location_permissions text[] default '{}'
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = core, public, pg_temp
as $$
begin
  if coalesce(cardinality(p_location_permissions), 0) > 64
     or coalesce(cardinality(p_tenant_permissions), 0) > 64
     or coalesce(cardinality(p_any_location_permissions), 0) > 64 then
    raise exception 'invalid_argument: at most 64 permissions per list' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'location', coalesce(
      (select jsonb_object_agg(perm, core.has_permission(p_tenant_id, perm, p_location_id))
         from unnest(coalesce(p_location_permissions, '{}')) as perm
        where perm is not null),
      '{}'::jsonb),
    'tenant', coalesce(
      (select jsonb_object_agg(perm, core.has_permission(p_tenant_id, perm, null))
         from unnest(coalesce(p_tenant_permissions, '{}')) as perm
        where perm is not null),
      '{}'::jsonb),
    'anyLocation', coalesce(
      (select jsonb_object_agg(perm, core.has_permission_in_tenant(p_tenant_id, perm))
         from unnest(coalesce(p_any_location_permissions, '{}')) as perm
        where perm is not null),
      '{}'::jsonb),
    'isTenantOwner', coalesce(core.caller_is_tenant_owner(p_tenant_id), false)
  );
end;
$$;

comment on function api.my_access(uuid, uuid, text[], text[], text[]) is
  '0142 (DEBT-124/135): batch of the caller''s own permission checks in one RPC. Delegates each entry to core.has_permission (location / tenant-wide) or core.has_permission_in_tenant, plus core.caller_is_tenant_owner -- identical answers to api.has_permission / api.has_permission_in_tenant / api.is_tenant_owner. Invoker-only (ADR 0008); booleans about the caller only; max 64 entries per list. UI/page gate only: RLS and RPCs re-check.';

revoke all on function api.my_access(uuid, uuid, text[], text[], text[]) from public, anon;
grant execute on function api.my_access(uuid, uuid, text[], text[], text[]) to authenticated;
