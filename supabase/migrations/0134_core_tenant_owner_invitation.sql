-- ============================================================================
-- 0134 — Role-aware tenant invitation for the Owner (Stage 4B, step 4B-2)
-- ----------------------------------------------------------------------------
-- Plan: docs/architecture/tenant-provisioning-plan-2026-10-18.md §2, §5, §7.
-- Groundwork for DEBT-091 (Manager appointment) and DEBT-094.
--
-- Why a new table and not workforce.employee_invitations (0064): an employee
-- invitation binds an Auth user to an existing workforce.employees row and
-- grants the `employee` role at that row's location. The Owner of a freshly
-- provisioned tenant has no employee row (and must not get one implicitly),
-- and needs a tenant-wide `tenant_owner` role. A role-aware core table keeps
-- the employee flow untouched and is reusable for Manager appointment later.
--
-- 1. core.tenant_invitations: tenant_id, target_user_id (-> core.users),
--    role_key ('tenant_owner' | 'manager'), location_id (NULL = tenant-wide;
--    always NULL for the owner), status pending / accepted / revoked, 7-day
--    expires_at (EXPIRED is derived, `pending and expires_at <= now()`, same as
--    0064 -- no job has to mark rows), the provisioning request it came from.
--    Token-less: Supabase Auth owns the email token; acceptance is by the
--    signed-in target user only. RLS: the target user can SELECT their own
--    pending rows; no write policy for any app role.
-- 2. core.create_tenant_owner_invitation(request_id, tenant_id, target_user_id,
--    email_encrypted, email_hash, actor): called by the provision-tenant Edge
--    Function AFTER the Auth Admin call resolved the Auth user. One
--    transaction: core.users mirror row (id + encrypted email + blind index,
--    supplied by the function; an existing row's email is never overwritten)
--    -> pending owner invitation (or a refresh of the same pending one: the
--    retry / resend path) -> provisioning status invite_sent -> audit row.
-- 3. core.set_provisioning_status(request_id, status, error_code, actor):
--    invite_failed / invite_sent / ready; never downgrades
--    (db_done < invite_failed < invite_sent < ready).
-- 4. core.accept_tenant_invitation(invitation_id): the signed-in target user
--    accepts; one transaction: core.users id row, active tenant membership,
--    role assignment (tenant_owner, location NULL), invitation accepted,
--    provisioning status ready, audit row. Idempotent (a second accept returns
--    the stored result). Only pending + unexpired + active tenant.
-- 5. core.my_pending_tenant_invitations(): the caller's own pending rows (for
--    the sign-in banner / callback in 4B-3).
-- 6. api.is_platform_staff(): the caller's own flag through their JWT, used by
--    the Edge Function and the admin console as the first gate (the service
--    functions re-check the actor themselves).
--
-- No plaintext PII anywhere: the email arrives encrypted (AES-256-GCM,
-- packages/db/src/crypto.ts layout) + HMAC blind index; audit rows carry ids,
-- roles and machine codes only.
--
-- Security: SECURITY DEFINER functions live in core with a fixed search_path;
-- create / set_status are service_role only; accept / my_pending are
-- authenticated (identity = core.current_user_id(), never an argument). The
-- api.* wrappers are SECURITY INVOKER (ADR 0008).
--
-- Rollback: explicit statements at the end of this file.
-- ============================================================================

-- --- table ------------------------------------------------------------------------
create table core.tenant_invitations (
  id                       uuid primary key default gen_random_uuid(),
  tenant_id                uuid not null references core.tenants(id) on delete cascade,
  target_user_id           uuid not null references core.users(id) on delete cascade,
  role_key                 text not null check (role_key in ('tenant_owner', 'manager')),
  location_id              uuid,
  provisioning_request_id  uuid references core.tenant_provisioning(request_id) on delete set null,
  status                   text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  invited_by               uuid references core.users(id) on delete set null,
  expires_at               timestamptz not null default (now() + interval '7 days'),
  accepted_at              timestamptz,
  revoked_at               timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  foreign key (tenant_id, location_id) references core.locations(tenant_id, id),
  check (role_key <> 'tenant_owner' or location_id is null),
  check ((status = 'accepted') = (accepted_at is not null)),
  check ((status = 'revoked') = (revoked_at is not null))
);
create index tenant_invitations_target_idx on core.tenant_invitations(target_user_id, status);
create index tenant_invitations_tenant_idx on core.tenant_invitations(tenant_id, status);
create index tenant_invitations_request_idx on core.tenant_invitations(provisioning_request_id);
-- At most one pending Owner invitation per tenant.
create unique index tenant_invitations_one_pending_owner
  on core.tenant_invitations(tenant_id) where role_key = 'tenant_owner' and status = 'pending';

comment on table core.tenant_invitations is
  'Role-aware tenant invitation (0134): Owner now (Stage 4B-2), Manager appointment later (DEBT-091). target_user_id is an Auth user resolved server-side by the provision-tenant Edge Function, never client input. No token, no email (Supabase Auth owns both). EXPIRED is derived (pending and expires_at <= now()). Written only by core.create_tenant_owner_invitation / core.accept_tenant_invitation.';

create trigger set_updated_at before update on core.tenant_invitations
  for each row execute function core.set_updated_at();

alter table core.tenant_invitations enable row level security;
create policy tenant_invitations_self_pending_read on core.tenant_invitations
  for select to authenticated
  using (target_user_id = core.current_user_id() and status = 'pending');
revoke all on core.tenant_invitations from public, anon, authenticated, service_role;
grant select on core.tenant_invitations to authenticated, service_role;

-- --- create / refresh the Owner invitation (service_role) ------------------------------
create or replace function core.create_tenant_owner_invitation(
  p_request_id uuid,
  p_tenant_id uuid,
  p_target_user_id uuid,
  p_email_encrypted bytea,
  p_email_hash text,
  p_actor_id uuid
)
returns jsonb
language plpgsql security definer set search_path = core, audit, public, pg_temp as $$
declare
  v_prov core.tenant_provisioning%rowtype;
  v_inv core.tenant_invitations%rowtype;
  v_resend boolean := false;
begin
  if p_request_id is null or p_tenant_id is null or p_target_user_id is null
     or p_email_encrypted is null or p_email_hash is null then
    raise exception 'invalid_argument: request_id, tenant_id, target_user_id and the protected email are required' using errcode = '22004';
  end if;
  perform core.assert_platform_staff_actor(p_actor_id);
  -- HMAC-SHA256 hex blind index; AES-GCM blob = 12-byte IV + 16-byte tag + >= 1 byte.
  if p_email_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_argument: email_hash must be a 64-char hex blind index' using errcode = '22023';
  end if;
  if octet_length(p_email_encrypted) < 29 then
    raise exception 'invalid_argument: email_encrypted is not an encrypted blob' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('core.tenant_provisioning:request:' || p_request_id::text, 0));
  select * into v_prov from core.tenant_provisioning where request_id = p_request_id for update;
  if not found then
    raise exception 'request_not_found' using errcode = 'P0001';
  end if;
  if v_prov.tenant_id is distinct from p_tenant_id then
    raise exception 'request_tenant_mismatch' using errcode = 'P0001';
  end if;
  if v_prov.status not in ('db_done', 'invite_failed', 'invite_sent') then
    raise exception 'request_not_invitable' using errcode = 'P0001';
  end if;

  -- core.users mirror (0002): id = auth.users.id; protected email only.
  insert into core.users (id, email_encrypted, email_hash)
  values (p_target_user_id, p_email_encrypted, p_email_hash)
  on conflict (id) do update
    set email_encrypted = coalesce(core.users.email_encrypted, excluded.email_encrypted),
        email_hash      = coalesce(core.users.email_hash, excluded.email_hash);

  select * into v_inv from core.tenant_invitations
   where tenant_id = p_tenant_id and role_key = 'tenant_owner' and status = 'pending'
   for update;
  if found then
    if v_inv.target_user_id <> p_target_user_id then
      raise exception 'owner_invitation_conflict' using errcode = 'P0001';
    end if;
    update core.tenant_invitations
       set expires_at = now() + interval '7 days', invited_by = p_actor_id,
           provisioning_request_id = coalesce(provisioning_request_id, p_request_id)
     where id = v_inv.id
    returning * into v_inv;
    v_resend := true;
  else
    if exists (select 1 from core.tenant_invitations
                where tenant_id = p_tenant_id and role_key = 'tenant_owner' and status = 'accepted') then
      raise exception 'owner_already_accepted' using errcode = 'P0001';
    end if;
    insert into core.tenant_invitations
      (tenant_id, target_user_id, role_key, location_id, provisioning_request_id, invited_by)
    values
      (p_tenant_id, p_target_user_id, 'tenant_owner', null, p_request_id, p_actor_id)
    returning * into v_inv;
  end if;

  update core.tenant_provisioning
     set status = 'invite_sent', step = 'invite', error_code = null
   where request_id = p_request_id and status in ('db_done', 'invite_failed');

  insert into audit.audit_logs (tenant_id, actor_id, actor_kind, module, entity, entity_id, action, after, metadata)
  values (p_tenant_id, p_actor_id, 'user', 'core', 'tenant_invitation', v_inv.id::text,
          case when v_resend then 'resend' else 'invite' end,
          jsonb_build_object('status', 'pending', 'role_key', 'tenant_owner'),
          jsonb_build_object('request_id', p_request_id, 'expires_at', v_inv.expires_at, 'resend', v_resend));

  return jsonb_build_object(
    'invitation_id', v_inv.id,
    'tenant_id', p_tenant_id,
    'request_id', p_request_id,
    'status', 'invite_sent',
    'expires_at', v_inv.expires_at,
    'was_resend', v_resend);
end;
$$;
comment on function core.create_tenant_owner_invitation(uuid, uuid, uuid, bytea, text, uuid) is
  'Stage 4B-2 (0134): after the provision-tenant Edge Function resolved the Owner''s Auth user, ONE transaction: core.users mirror row with the encrypted email + blind index (never overwrites an existing email), a pending tenant_owner invitation (or a refresh of the same pending one = retry / resend), provisioning status invite_sent, audit row. Refuses another target while one is pending (owner_invitation_conflict), a tenant whose owner already accepted, a request without a provisioned tenant. Platform-staff actor only. service_role only.';

-- --- provisioning status after the DB step (service_role) -------------------------------
create or replace function core.set_provisioning_status(p_request_id uuid, p_status text, p_error_code text, p_actor_id uuid)
returns jsonb
language plpgsql security definer set search_path = core, audit, public, pg_temp as $$
declare
  v_row core.tenant_provisioning%rowtype;
  v_prev text;
  v_rank_cur int;
  v_rank_new int;
begin
  if p_request_id is null or p_status is null then
    raise exception 'invalid_argument: request_id and status are required' using errcode = '22004';
  end if;
  perform core.assert_platform_staff_actor(p_actor_id);
  if p_status not in ('invite_failed', 'invite_sent', 'ready') then
    raise exception 'invalid_argument: status must be invite_failed, invite_sent or ready' using errcode = '22023';
  end if;
  if p_status = 'invite_failed' then
    if p_error_code is null or p_error_code !~ '^[a-z0-9_]{1,64}$' then
      raise exception 'invalid_argument: invite_failed needs an error_code matching ^[a-z0-9_]{1,64}$' using errcode = '22023';
    end if;
  elsif p_error_code is not null then
    raise exception 'invalid_argument: error_code only with invite_failed' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('core.tenant_provisioning:request:' || p_request_id::text, 0));
  select * into v_row from core.tenant_provisioning where request_id = p_request_id for update;
  if not found then
    raise exception 'request_not_found' using errcode = 'P0001';
  end if;
  if v_row.status in ('requested', 'failed_db') or v_row.tenant_id is null then
    raise exception 'request_not_provisioned' using errcode = 'P0001';
  end if;

  v_rank_cur := case v_row.status when 'db_done' then 1 when 'invite_failed' then 2 when 'invite_sent' then 3 when 'ready' then 4 end;
  v_rank_new := case p_status when 'invite_failed' then 2 when 'invite_sent' then 3 when 'ready' then 4 end;
  -- never downgrade; the same state again is a no-op (a repeated invite_failed only refreshes its code)
  if v_rank_new < v_rank_cur or (v_rank_new = v_rank_cur and p_status <> 'invite_failed') then
    return core.provisioning_result(v_row, true);
  end if;

  if p_status = 'invite_sent' and not exists (
       select 1 from core.tenant_invitations
        where tenant_id = v_row.tenant_id and role_key = 'tenant_owner' and status in ('pending', 'accepted')) then
    raise exception 'owner_invitation_missing' using errcode = 'P0001';
  end if;
  if p_status = 'ready' and not exists (
       select 1 from core.tenant_invitations
        where tenant_id = v_row.tenant_id and role_key = 'tenant_owner' and status = 'accepted') then
    raise exception 'owner_not_accepted' using errcode = 'P0001';
  end if;

  v_prev := v_row.status;
  update core.tenant_provisioning
     set status = p_status,
         step = case when p_status = 'ready' then 'ready' else 'invite' end,
         error_code = p_error_code
   where request_id = p_request_id
  returning * into v_row;

  insert into audit.audit_logs (tenant_id, actor_id, actor_kind, module, entity, entity_id, action, before, after, metadata)
  values (v_row.tenant_id, p_actor_id, 'user', 'core', 'tenant', v_row.tenant_id::text, 'provision_status',
          jsonb_build_object('status', v_prev), jsonb_build_object('status', p_status),
          jsonb_build_object('request_id', p_request_id, 'error_code', p_error_code));

  return core.provisioning_result(v_row, false);
end;
$$;
comment on function core.set_provisioning_status(uuid, text, text, uuid) is
  'Stage 4B-2 (0134): moves a provisioned request to invite_failed (with a machine error code), invite_sent (owner invitation exists) or ready (owner accepted). Never downgrades (db_done < invite_failed < invite_sent < ready; lower or equal = no-op, idempotent result). One audit row per real change. Platform-staff actor only. service_role only.';

-- --- accept (the signed-in target user) ------------------------------------------------------
create or replace function core.accept_tenant_invitation(p_invitation_id uuid)
returns jsonb
language plpgsql security definer set search_path = core, audit, public, pg_temp as $$
declare
  v_uid uuid := core.current_user_id();
  v_inv core.tenant_invitations%rowtype;
  v_role_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_invitation_id is null then
    raise exception 'invitation_not_acceptable' using errcode = 'P0001';
  end if;

  -- Looked up by id AND the caller's verified identity: another user's
  -- invitation is indistinguishable from a missing one.
  select * into v_inv from core.tenant_invitations
   where id = p_invitation_id and target_user_id = v_uid
   for update;
  if not found then
    raise exception 'invitation_not_acceptable' using errcode = 'P0001';
  end if;
  if v_inv.status = 'accepted' then
    return jsonb_build_object('invitation_id', v_inv.id, 'tenant_id', v_inv.tenant_id,
                              'role_key', v_inv.role_key, 'location_id', v_inv.location_id, 'idempotent', true);
  end if;
  if v_inv.status <> 'pending' or v_inv.expires_at <= now()
     or not exists (select 1 from core.tenants where id = v_inv.tenant_id and status = 'active') then
    raise exception 'invitation_not_acceptable' using errcode = 'P0001';
  end if;

  select id into v_role_id from core.roles where tenant_id is null and key = v_inv.role_key;
  if v_role_id is null then
    raise exception 'role_missing' using errcode = 'P0001';
  end if;

  -- 1. identity mirror (id only; the protected email was stored at invite time)
  insert into core.users (id) values (v_uid) on conflict (id) do nothing;

  -- 2. active membership (create, or activate an 'invited' row; same as 0064)
  insert into core.tenant_memberships (tenant_id, user_id, location_id, status, invited_by)
  values (v_inv.tenant_id, v_uid, v_inv.location_id, 'active', v_inv.invited_by)
  on conflict (tenant_id, user_id) do nothing;
  update core.tenant_memberships set status = 'active'
   where tenant_id = v_inv.tenant_id and user_id = v_uid and status = 'invited';

  -- 3. the invited role (NULL location = tenant-wide; NULL is distinct in the unique index -> NOT EXISTS)
  insert into core.role_assignments (tenant_id, user_id, role_id, location_id)
  select v_inv.tenant_id, v_uid, v_role_id, v_inv.location_id
   where not exists (
     select 1 from core.role_assignments
      where tenant_id = v_inv.tenant_id and user_id = v_uid and role_id = v_role_id
        and location_id is not distinct from v_inv.location_id);

  -- 4. accepted
  update core.tenant_invitations set status = 'accepted', accepted_at = now()
   where id = v_inv.id;

  -- 5. the provisioning request is complete once its Owner is in
  if v_inv.role_key = 'tenant_owner' and v_inv.provisioning_request_id is not null then
    update core.tenant_provisioning set status = 'ready', step = 'ready', error_code = null
     where request_id = v_inv.provisioning_request_id and status in ('db_done', 'invite_failed', 'invite_sent');
  end if;

  insert into audit.audit_logs (tenant_id, actor_id, actor_kind, module, entity, entity_id, action, after, metadata)
  values (v_inv.tenant_id, v_uid, 'user', 'core', 'tenant_invitation', v_inv.id::text, 'accept',
          jsonb_build_object('status', 'accepted', 'role_key', v_inv.role_key),
          jsonb_build_object('location_id', v_inv.location_id, 'request_id', v_inv.provisioning_request_id));

  return jsonb_build_object('invitation_id', v_inv.id, 'tenant_id', v_inv.tenant_id,
                            'role_key', v_inv.role_key, 'location_id', v_inv.location_id, 'idempotent', false);
end;
$$;
comment on function core.accept_tenant_invitation(uuid) is
  'Stage 4B-2 (0134): the signed-in target user (core.current_user_id(), never an argument) accepts a pending, unexpired invitation of an active tenant. ONE transaction: core.users id row, active tenant membership, role assignment (role_key, location NULL = tenant-wide), invitation accepted, provisioning status ready (owner), audit row. Second call = stored result (idempotent). Anything else -> invitation_not_acceptable (no hint whether the id exists). SECURITY DEFINER because the caller holds no tenant role yet (same reasoning as workforce.accept_employee_invitation, 0064).';

-- --- the caller's own pending invitations -------------------------------------------------------
create or replace function core.my_pending_tenant_invitations()
returns table (invitation_id uuid, tenant_id uuid, tenant_name text, role_key text,
               location_id uuid, expires_at timestamptz, is_expired boolean, created_at timestamptz)
language sql stable security definer set search_path = core, public, pg_temp as $$
  select i.id, i.tenant_id, t.name, i.role_key, i.location_id, i.expires_at, i.expires_at <= now(), i.created_at
    from core.tenant_invitations i
    join core.tenants t on t.id = i.tenant_id
   where i.target_user_id = core.current_user_id()
     and i.status = 'pending'
   order by i.created_at;
$$;
comment on function core.my_pending_tenant_invitations() is
  'The caller''s own pending tenant invitations (0134), scoped to core.current_user_id() explicitly. Includes the tenant name (the invited user is not a member yet, so RLS would hide it). For the sign-in banner / invite callback (4B-3). Read-only.';

-- --- grants -------------------------------------------------------------------------------------
revoke all on function core.create_tenant_owner_invitation(uuid, uuid, uuid, bytea, text, uuid) from public, anon, authenticated;
revoke all on function core.set_provisioning_status(uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function core.accept_tenant_invitation(uuid) from public, anon;
revoke all on function core.my_pending_tenant_invitations() from public, anon;
grant execute on function core.create_tenant_owner_invitation(uuid, uuid, uuid, bytea, text, uuid) to service_role;
grant execute on function core.set_provisioning_status(uuid, text, text, uuid) to service_role;
grant execute on function core.accept_tenant_invitation(uuid) to authenticated;
grant execute on function core.my_pending_tenant_invitations() to authenticated;

-- --- api facade (ADR 0008: invoker only) ------------------------------------------------------------
create or replace function api.create_tenant_owner_invitation(
  p_request_id uuid, p_tenant_id uuid, p_target_user_id uuid,
  p_email_encrypted bytea, p_email_hash text, p_actor_id uuid)
returns jsonb language sql security invoker set search_path = core, public as $$
  select core.create_tenant_owner_invitation(p_request_id, p_tenant_id, p_target_user_id, p_email_encrypted, p_email_hash, p_actor_id);
$$;
create or replace function api.set_provisioning_status(p_request_id uuid, p_status text, p_error_code text, p_actor_id uuid)
returns jsonb language sql security invoker set search_path = core, public as $$
  select core.set_provisioning_status(p_request_id, p_status, p_error_code, p_actor_id);
$$;
create or replace function api.accept_tenant_invitation(p_invitation_id uuid)
returns jsonb language sql security invoker set search_path = core, public as $$
  select core.accept_tenant_invitation(p_invitation_id);
$$;
create or replace function api.my_pending_tenant_invitations()
returns table (invitation_id uuid, tenant_id uuid, tenant_name text, role_key text,
               location_id uuid, expires_at timestamptz, is_expired boolean, created_at timestamptz)
language sql stable security invoker set search_path = core, public as $$
  select * from core.my_pending_tenant_invitations();
$$;
create or replace function api.is_platform_staff()
returns boolean language sql stable security invoker set search_path = core, public as $$
  select core.is_platform_staff();
$$;
comment on function api.is_platform_staff() is
  'The CALLER''s own is_platform_staff flag (0134), through their JWT (core.is_platform_staff, 0006). Gate for the provision-tenant Edge Function and the admin console; the service functions re-check the actor themselves.';

revoke all on function api.create_tenant_owner_invitation(uuid, uuid, uuid, bytea, text, uuid) from public, anon, authenticated;
revoke all on function api.set_provisioning_status(uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function api.accept_tenant_invitation(uuid) from public, anon;
revoke all on function api.my_pending_tenant_invitations() from public, anon;
revoke all on function api.is_platform_staff() from public, anon;
grant execute on function api.create_tenant_owner_invitation(uuid, uuid, uuid, bytea, text, uuid) to service_role;
grant execute on function api.set_provisioning_status(uuid, text, text, uuid) to service_role;
grant execute on function api.accept_tenant_invitation(uuid) to authenticated;
grant execute on function api.my_pending_tenant_invitations() to authenticated;
grant execute on function api.is_platform_staff() to authenticated;

-- ============================================================================
-- Rollback (accepted memberships / role assignments stay; only the machinery goes):
--   drop function if exists api.is_platform_staff();
--   drop function if exists api.my_pending_tenant_invitations();
--   drop function if exists api.accept_tenant_invitation(uuid);
--   drop function if exists api.set_provisioning_status(uuid, text, text, uuid);
--   drop function if exists api.create_tenant_owner_invitation(uuid, uuid, uuid, bytea, text, uuid);
--   drop function if exists core.my_pending_tenant_invitations();
--   drop function if exists core.accept_tenant_invitation(uuid);
--   drop function if exists core.set_provisioning_status(uuid, text, text, uuid);
--   drop function if exists core.create_tenant_owner_invitation(uuid, uuid, uuid, bytea, text, uuid);
--   drop table if exists core.tenant_invitations;
-- ============================================================================
