-- ============================================================================
-- 0148 — Orphan users on tenant purge + unreferenced-user cleanup (DEBT-103 b)
-- ----------------------------------------------------------------------------
-- Runbook: docs/operations/tenant-deletion-procedure.md.
--
-- Gap in 0141: core.purge_tenant took as "orphan" only members of the purged
-- tenant. A user invited to the tenant who never accepted (core + auth user,
-- employee link and pending invitation, no membership) was not an orphan: the
-- cascade removed the employee / invitation rows and the user stayed in
-- auth.users with an email, referenced by nothing (Cloud DEV case
-- oruwa.jp+o7staff1 after the qa-4c-cafe-7 purge). The same happens to users
-- whose memberships were removed when a tenant was archived by hand
-- (mame-to-cha, smoke tenants): by purge time nothing links them to it.
--
-- 1. core.user_is_referenced(p_user_id, p_except_tenant_id) -> boolean.
--    True when ANY row of ANY table points at the user through a foreign key
--    to core.users (discovered from pg_constraint, so new tables are covered
--    without a code change; every delete action counts, also SET NULL such as
--    workforce.employees.user_id or audit.audit_logs.actor_id). With
--    p_except_tenant_id, rows whose tenant_id equals it are ignored (the rows
--    the purge cascade is about to delete). Tables without a tenant_id column
--    always count. Short-circuits on the first hit. A multi-column FK to
--    core.users (none today) raises unsupported_user_reference instead of
--    being skipped. Internal helper: SECURITY INVOKER (it only runs inside
--    the postgres-owned definers below), search_path '', no grant to anyone.
--    Both callers lock the users' core.users / auth.users rows FOR UPDATE
--    before the check, so a concurrent invitation / membership insert for
--    the same user either waits and then fails (FK) or is already visible.
-- 2. core.purge_tenant: same signature and behaviour as 0141, except
--      a. orphan candidates = users referenced by this tenant through a
--         membership, role assignment, employee link, employee invitation or
--         tenant invitation (any status), not platform staff, and not
--         referenced by anything outside this tenant
--         (core.user_is_referenced(u, p_tenant_id) is false);
--      b. real run with p_delete_orphan_auth_users: after the cascade only the
--         candidates that are still referenced by nothing at all
--         (core.user_is_referenced(u, null) is false) are deleted, so a
--         leftover reference (e.g. a provisioning row whose tenant_id became
--         null) keeps the user instead of failing the purge with a foreign key
--         error. The result adds deleted_user_ids; deleted_auth_user_count and
--         the tombstone hold the real number.
-- 3. audit.user_purge_log: one row per deleted user, from core.purge_tenant
--    (with the tombstone id) or core.purge_unreferenced_users (user id, time,
--    who ran it, source). No email, no name. RLS on, no policy, service_role
--    may read.
--    Known behaviour: a non-staff provisioning requester stays referenced by
--    the core.tenant_provisioning row (kept to reserve the slug), so it is
--    never deleted; requesters are platform staff in practice.
-- 4. core.purge_unreferenced_users(p_user_ids uuid[], p_dry_run default true)
--    returns jsonb. SECURITY DEFINER, search_path '', service_role only.
--      22004 invalid_argument  — p_user_ids / p_dry_run null, or a real run
--                                with an empty list
--      P0002 user_not_found    — an id in neither core.users nor auth.users
--      P0001 user_protected    — platform staff
--      P0001 user_referenced   — anything still points at the user
--    Dry run with an empty list: lists every unreferenced, non-staff user
--    (core.users or auth.users), with auth created_at / last_sign_in_at, no
--    email. Dry run with ids: checks them, writes nothing. Real run: checks
--    every id first (all or nothing), then deletes core.users + auth.users and
--    writes one audit.user_purge_log row per user.
--
-- Rollback: commented block at the end of this file.
-- ============================================================================

-- --- 1. reference check ---------------------------------------------------------
create or replace function core.user_is_referenced(p_user_id uuid, p_except_tenant_id uuid)
returns boolean
language plpgsql stable security invoker set search_path = '' as $$
declare
  r record;
  v_hit boolean;
begin
  -- fail closed: a multi-column FK to core.users would be invisible below
  if exists (select 1 from pg_catalog.pg_constraint k
              where k.contype = 'f' and k.confrelid = 'core.users'::pg_catalog.regclass
                and cardinality(k.conkey) <> 1) then
    raise exception 'unsupported_user_reference: multi-column foreign key to core.users' using errcode = 'P0001';
  end if;

  for r in
    select n.nspname as schema_name, c.relname as table_name, a.attname as column_name,
           exists (select 1 from pg_catalog.pg_attribute t
                    where t.attrelid = c.oid and t.attname = 'tenant_id' and not t.attisdropped
                      and t.atttypid = 'pg_catalog.uuid'::pg_catalog.regtype) as has_tenant_id
      from pg_catalog.pg_constraint k
      join pg_catalog.pg_class c on c.oid = k.conrelid
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      join pg_catalog.pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
     where k.contype = 'f'
       and k.confrelid = 'core.users'::pg_catalog.regclass
       and cardinality(k.conkey) = 1
       and k.conparentid = 0
     order by 1, 2, 3
  loop
    if r.has_tenant_id and p_except_tenant_id is not null then
      execute format('select exists (select 1 from %I.%I where %I = $1 and tenant_id is distinct from $2)',
                     r.schema_name, r.table_name, r.column_name)
        into v_hit using p_user_id, p_except_tenant_id;
    else
      execute format('select exists (select 1 from %I.%I where %I = $1)',
                     r.schema_name, r.table_name, r.column_name)
        into v_hit using p_user_id;
    end if;
    if v_hit then
      return true;
    end if;
  end loop;
  return false;
end;
$$;
comment on function core.user_is_referenced(uuid, uuid) is
  'DEBT-103 b (0148): true when any row points at the user through a foreign key to core.users (all FK columns, discovered from pg_constraint; a multi-column FK raises unsupported_user_reference). Rows with tenant_id = p_except_tenant_id are ignored; tables without tenant_id always count. SECURITY INVOKER internal helper of the postgres-owned definers core.purge_tenant / core.purge_unreferenced_users; no grants.';
alter function core.user_is_referenced(uuid, uuid) owner to postgres;
revoke all on function core.user_is_referenced(uuid, uuid) from public, anon, authenticated, service_role;

-- --- 2. core.purge_tenant with the wider orphan rule ------------------------------
create or replace function core.purge_tenant(
  p_tenant_id uuid,
  p_confirm_slug text,
  p_dry_run boolean default true,
  p_delete_orphan_auth_users boolean default false
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c_excluded_schemas constant text[] := array[
    'information_schema', 'auth', 'storage', 'extensions', 'api', 'graphql', 'graphql_public',
    'realtime', '_realtime', 'supabase_functions', 'supabase_migrations', 'vault', 'pgsodium',
    'pgsodium_masks', 'net', 'cron', 'pgbouncer', '_analytics', 'pgtle'];
  v_tenant core.tenants%rowtype;
  r record;
  v_n bigint;
  v_counts jsonb := '{}'::jsonb;
  v_remaining jsonb := '{}'::jsonb;
  v_audit_n bigint;
  v_audit_digest text;
  v_event_n bigint;
  v_storage jsonb := '[]'::jsonb;
  v_storage_n int := 0;
  v_orphans uuid[];
  v_deleted_ids uuid[] := '{}'::uuid[];
  v_deleted int := 0;
  v_purge_id bigint;
begin
  if p_tenant_id is null or p_confirm_slug is null or p_dry_run is null or p_delete_orphan_auth_users is null then
    raise exception 'invalid_argument: tenant id, confirm slug and flags are required' using errcode = '22004';
  end if;

  select * into v_tenant from core.tenants where id = p_tenant_id for update;
  if not found then
    raise exception 'tenant_not_found' using errcode = 'P0002';
  end if;
  if v_tenant.slug::text <> p_confirm_slug then
    raise exception 'confirm_slug_mismatch' using errcode = 'P0001';
  end if;
  if v_tenant.kind = 'client_template'::core.tenant_kind then
    raise exception 'tenant_protected' using errcode = 'P0001';
  end if;
  if v_tenant.status <> 'archived'::core.tenant_status then
    raise exception 'tenant_not_archived' using errcode = 'P0001';
  end if;

  -- per-table row counts (every base table with a uuid tenant_id column in the app schemas)
  for r in
    select n.nspname as schema_name, c.relname as table_name
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      join pg_catalog.pg_attribute a on a.attrelid = c.oid
     where a.attname = 'tenant_id' and not a.attisdropped
       and a.atttypid = 'pg_catalog.uuid'::pg_catalog.regtype
       and c.relkind in ('r', 'p') and not c.relispartition
       and n.nspname <> all (c_excluded_schemas)
       and n.nspname not like 'pg\_%'
       and not (n.nspname = 'audit' and c.relname = 'tenant_purge_log')
     order by 1, 2
  loop
    execute format('select count(*) from %I.%I where tenant_id = $1', r.schema_name, r.table_name)
      into v_n using p_tenant_id;
    if v_n > 0 then
      v_counts := v_counts || jsonb_build_object(r.schema_name || '.' || r.table_name, v_n);
    end if;
  end loop;
  v_counts := v_counts || jsonb_build_object('core.tenants', 1);

  select count(*),
         encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(al) order by al.id), '[]'::jsonb)::text, 'UTF8')), 'hex')
    into v_audit_n, v_audit_digest
    from audit.audit_logs al where al.tenant_id = p_tenant_id;
  select count(*) into v_event_n from core.events where tenant_id = p_tenant_id;

  -- storage objects of the tenant (path layout '<tenant_id>/...', all buckets)
  if to_regclass('storage.objects') is not null then
    execute $q$
      select coalesce(jsonb_agg(jsonb_build_object('bucket', o.bucket_id, 'name', o.name)
                                order by o.bucket_id, o.name), '[]'::jsonb),
             count(*)::int
        from storage.objects o
       where split_part(o.name, '/', 1) = $1
    $q$ into v_storage, v_storage_n using p_tenant_id::text;
  end if;

  -- orphan candidates: people of this tenant (member, role, employee link, any
  -- invitation), not platform staff, referenced by nothing outside this tenant
  select coalesce(array_agg(x.user_id order by x.user_id), '{}'::uuid[]) into v_orphans
    from (
      select m.user_id from core.tenant_memberships m where m.tenant_id = p_tenant_id
      union
      select ra.user_id from core.role_assignments ra where ra.tenant_id = p_tenant_id
      union
      select e.user_id from workforce.employees e where e.tenant_id = p_tenant_id and e.user_id is not null
      union
      select ei.target_user_id from workforce.employee_invitations ei where ei.tenant_id = p_tenant_id
      union
      select ti.target_user_id from core.tenant_invitations ti where ti.tenant_id = p_tenant_id
    ) x
    join core.users u on u.id = x.user_id
   where not u.is_platform_staff
     and not core.user_is_referenced(x.user_id, p_tenant_id);

  if p_dry_run then
    return jsonb_build_object(
      'dry_run', true,
      'tenant_id', p_tenant_id,
      'tenant_slug', v_tenant.slug::text,
      'row_counts', v_counts,
      'audit_row_count', v_audit_n,
      'audit_digest', v_audit_digest,
      'event_row_count', v_event_n,
      'storage_object_count', v_storage_n,
      'storage_objects', v_storage,
      'orphan_user_count', cardinality(v_orphans),
      'orphan_user_ids', to_jsonb(v_orphans),
      'delete_orphan_auth_users', p_delete_orphan_auth_users,
      'deleted_user_ids', '[]'::jsonb,
      'deleted_auth_user_count', 0);
  end if;

  -- real run: tombstone first, then the cascade
  insert into audit.tenant_purge_log
    (tenant_id, tenant_slug, purged_by, row_counts, audit_row_count, audit_digest,
     event_row_count, deleted_auth_user_count)
  values
    (p_tenant_id, v_tenant.slug::text,
     concat_ws('/', session_user::text, nullif(current_setting('role', true), 'none')),
     v_counts, v_audit_n, v_audit_digest, v_event_n, 0)
  returning id into v_purge_id;

  perform set_config('oruwa.purge_tenant_id', p_tenant_id::text, true);
  delete from core.tenants where id = p_tenant_id;
  perform set_config('oruwa.purge_tenant_id', '', true);

  -- nothing of the tenant may be left behind (a table without the cascade FK)
  for r in
    select n.nspname as schema_name, c.relname as table_name
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      join pg_catalog.pg_attribute a on a.attrelid = c.oid
     where a.attname = 'tenant_id' and not a.attisdropped
       and a.atttypid = 'pg_catalog.uuid'::pg_catalog.regtype
       and c.relkind in ('r', 'p') and not c.relispartition
       and n.nspname <> all (c_excluded_schemas)
       and n.nspname not like 'pg\_%'
       and not (n.nspname = 'audit' and c.relname = 'tenant_purge_log')
  loop
    execute format('select count(*) from %I.%I where tenant_id = $1', r.schema_name, r.table_name)
      into v_n using p_tenant_id;
    if v_n > 0 then
      v_remaining := v_remaining || jsonb_build_object(r.schema_name || '.' || r.table_name, v_n);
    end if;
  end loop;
  if v_remaining <> '{}'::jsonb then
    raise exception 'purge_incomplete: %', v_remaining::text using errcode = 'P0001';
  end if;

  -- orphans: only candidates nothing points at any more after the cascade
  if p_delete_orphan_auth_users and cardinality(v_orphans) > 0 then
    -- lock first, then re-check (a concurrent invite either waits and fails or is seen)
    perform 1 from core.users where id = any (v_orphans) order by id for update;
    perform 1 from auth.users where id = any (v_orphans) order by id for update;
    select coalesce(array_agg(o order by o), '{}'::uuid[]) into v_deleted_ids
      from unnest(v_orphans) o
     where not core.user_is_referenced(o, null);
    v_deleted := cardinality(v_deleted_ids);
    if v_deleted > 0 then
      delete from core.users where id = any (v_deleted_ids);
      get diagnostics v_n = row_count;
      if v_n <> v_deleted then
        raise exception 'orphan_user_delete_mismatch' using errcode = 'P0001';
      end if;
      delete from auth.users where id = any (v_deleted_ids);
      update audit.tenant_purge_log set deleted_auth_user_count = v_deleted where id = v_purge_id;
      insert into audit.user_purge_log (user_id, purged_by, source, tenant_purge_log_id)
      select o, concat_ws('/', session_user::text, nullif(current_setting('role', true), 'none')),
             'purge_tenant', v_purge_id
        from unnest(v_deleted_ids) o;
    end if;
  end if;

  return jsonb_build_object(
    'dry_run', false,
    'purge_log_id', v_purge_id,
    'tenant_id', p_tenant_id,
    'tenant_slug', v_tenant.slug::text,
    'row_counts', v_counts,
    'audit_row_count', v_audit_n,
    'audit_digest', v_audit_digest,
    'event_row_count', v_event_n,
    'storage_object_count', v_storage_n,
    'storage_objects', v_storage,
    'orphan_user_count', cardinality(v_orphans),
    'orphan_user_ids', to_jsonb(v_orphans),
    'delete_orphan_auth_users', p_delete_orphan_auth_users,
    'deleted_user_ids', to_jsonb(v_deleted_ids),
    'deleted_auth_user_count', v_deleted);
end;
$$;
comment on function core.purge_tenant(uuid, text, boolean, boolean) is
  'DEBT-103 (0141; orphan rule 0148): physical deletion of an ARCHIVED tenant. p_confirm_slug must equal its slug; client_template tenants refused. Dry run (default) returns per-table row counts, audit/event counts + audit sha256 digest, storage objects (bucket/name, not deleted here: use the Storage API) and orphan candidates (members, role holders, linked employees and invitees of this tenant that nothing outside it references, not platform staff), writing nothing. Real run writes one audit.tenant_purge_log tombstone, then cascades the tenant delete (append-only triggers allow exactly this cascade), refuses if any tenant row is left (purge_incomplete), and with p_delete_orphan_auth_users deletes the candidates nothing references after the cascade (core.users + auth.users; deleted_user_ids). service_role only. Runbook: docs/operations/tenant-deletion-procedure.md.';

alter function core.purge_tenant(uuid, text, boolean, boolean) owner to postgres;
revoke all on function core.purge_tenant(uuid, text, boolean, boolean) from public, anon, authenticated;
grant execute on function core.purge_tenant(uuid, text, boolean, boolean) to service_role;

-- --- 3. tombstone for user deletions -------------------------------------------
create table audit.user_purge_log (
  id                   bigint generated always as identity primary key,
  user_id              uuid not null,
  purged_at            timestamptz not null default now(),
  purged_by            text not null,
  source               text not null check (source in ('purge_tenant', 'purge_unreferenced_users')),
  tenant_purge_log_id  bigint references audit.tenant_purge_log(id),
  check ((source = 'purge_tenant') = (tenant_purge_log_id is not null))
);
create index user_purge_log_user_idx on audit.user_purge_log(user_id);
comment on table audit.user_purge_log is
  'One row per user deleted by core.purge_tenant (orphans, with the tombstone id) or core.purge_unreferenced_users (0148, DEBT-103 b). Kept indefinitely. User id, time, session role and source only -- no email, no name.';

alter table audit.user_purge_log enable row level security;
revoke all on audit.user_purge_log from public, anon, authenticated, service_role;
grant select on audit.user_purge_log to service_role;

-- --- 4. core.purge_unreferenced_users ----------------------------------------------
create or replace function core.purge_unreferenced_users(
  p_user_ids uuid[],
  p_dry_run boolean default true
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_ids uuid[];
  v_id uuid;
  v_list jsonb;
  v_n bigint;
  v_core_n bigint;
  v_by text := concat_ws('/', session_user::text, nullif(current_setting('role', true), 'none'));
begin
  if p_user_ids is null or p_dry_run is null then
    raise exception 'invalid_argument: user ids and dry-run flag are required' using errcode = '22004';
  end if;
  if array_position(p_user_ids, null) is not null then
    raise exception 'invalid_argument: null user id' using errcode = '22004';
  end if;

  -- dry run without ids: list every unreferenced, non-staff user
  if cardinality(p_user_ids) = 0 then
    if not p_dry_run then
      raise exception 'invalid_argument: a real run needs explicit user ids' using errcode = '22004';
    end if;
    select coalesce(jsonb_agg(jsonb_build_object(
             'user_id', x.id,
             'has_core_user', cu.id is not null,
             'has_auth_user', au.id is not null,
             'auth_created_at', au.created_at,
             'last_sign_in_at', au.last_sign_in_at) order by au.created_at nulls first, x.id), '[]'::jsonb)
      into v_list
      from (select id from core.users union select id from auth.users) x
      left join core.users cu on cu.id = x.id
      left join auth.users au on au.id = x.id
     where not coalesce(cu.is_platform_staff, false)
       and not core.user_is_referenced(x.id, null);
    return jsonb_build_object('dry_run', true, 'unreferenced_user_count', jsonb_array_length(v_list),
                              'unreferenced_users', v_list);
  end if;

  select array_agg(distinct i order by i) into v_ids from unnest(p_user_ids) i;

  -- real run: lock first, then check (a concurrent invite either waits and fails or is seen)
  if not p_dry_run then
    perform 1 from core.users where id = any (v_ids) order by id for update;
    perform 1 from auth.users where id = any (v_ids) order by id for update;
  end if;

  -- every id is checked before anything is deleted (all or nothing)
  foreach v_id in array v_ids loop
    if not exists (select 1 from core.users where id = v_id)
       and not exists (select 1 from auth.users where id = v_id) then
      raise exception 'user_not_found: %', v_id using errcode = 'P0002';
    end if;
    if exists (select 1 from core.users where id = v_id and is_platform_staff) then
      raise exception 'user_protected: %', v_id using errcode = 'P0001';
    end if;
    if core.user_is_referenced(v_id, null) then
      raise exception 'user_referenced: %', v_id using errcode = 'P0001';
    end if;
  end loop;

  if p_dry_run then
    return jsonb_build_object('dry_run', true, 'user_ids', to_jsonb(v_ids),
                              'user_count', cardinality(v_ids), 'deleted_user_count', 0);
  end if;

  delete from core.users where id = any (v_ids);
  get diagnostics v_core_n = row_count;
  delete from auth.users where id = any (v_ids);
  get diagnostics v_n = row_count;
  insert into audit.user_purge_log (user_id, purged_by, source)
  select i, v_by, 'purge_unreferenced_users' from unnest(v_ids) i;

  return jsonb_build_object('dry_run', false, 'user_ids', to_jsonb(v_ids),
                            'user_count', cardinality(v_ids),
                            'deleted_core_user_count', v_core_n,
                            'deleted_auth_user_count', v_n);
end;
$$;
comment on function core.purge_unreferenced_users(uuid[], boolean) is
  'DEBT-103 b (0148): delete users nothing references any more (no FK row anywhere points at core.users.id), e.g. invitees of a purged tenant or people whose memberships were removed when a tenant was archived. Empty list + dry run: lists all such non-staff users (ids, auth created_at / last_sign_in_at, no email). With ids: refuses unknown (user_not_found), platform staff (user_protected) and referenced (user_referenced) users before deleting anything; real run deletes core.users + auth.users and writes audit.user_purge_log. service_role only. Runbook: docs/operations/tenant-deletion-procedure.md.';

alter function core.purge_unreferenced_users(uuid[], boolean) owner to postgres;
revoke all on function core.purge_unreferenced_users(uuid[], boolean) from public, anon, authenticated;
grant execute on function core.purge_unreferenced_users(uuid[], boolean) to service_role;

-- ============================================================================
-- Rollback (deleted users stay deleted):
--   drop function if exists core.purge_unreferenced_users(uuid[], boolean);
--   drop table if exists audit.user_purge_log;
--   -- re-run section 3 of 0141_core_tenant_purge.sql (core.purge_tenant as of 0141)
--   drop function if exists core.user_is_referenced(uuid, uuid);
-- ============================================================================
