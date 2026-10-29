-- ============================================================================
-- 0141 — Deliberate physical tenant deletion (DEBT-103)
-- ----------------------------------------------------------------------------
-- Runbook: docs/operations/tenant-deletion-procedure.md.
--
-- Until now `delete from core.tenants` could not run: the ON DELETE CASCADE
-- reaches audit.audit_logs (0005, trigger audit_logs_no_update ->
-- audit.prevent_mutation) and core.events (0110, trigger events_no_update ->
-- core.prevent_event_mutation), and both triggers refuse every DELETE. Those
-- two append-only triggers are the only blockers (verified on Cloud DEV).
--
-- 1. audit.tenant_purge_log: one tombstone row per purged tenant, kept
--    indefinitely. No FK to core.tenants (it must outlive the tenant). Holds
--    ids, slug, per-table row counts and a sha256 digest of the tenant's audit
--    rows (jsonb_agg ordered by id) — no row content, no PII. RLS on, no
--    policy; anon / authenticated get nothing; service_role may read.
-- 2. audit.prevent_mutation() / core.prevent_event_mutation(): UPDATE is
--    always refused. DELETE is allowed only when BOTH hold:
--      a. current_setting('oruwa.purge_tenant_id', true) = old.tenant_id::text
--         (set transaction-locally by core.purge_tenant only), and
--      b. the core.tenants row of old.tenant_id no longer exists, i.e. the
--         delete is the FK cascade of a tenant delete. (b) is defense in
--         depth: any role can set a custom GUC, so the GUC alone must never
--         open the trail of a live tenant.
--    Every other case raises the original exception text. The functions are
--    now SECURITY DEFINER (search_path '') so check (b) is not hidden by the
--    caller's RLS.
-- 3. core.purge_tenant(p_tenant_id, p_confirm_slug, p_dry_run default true,
--    p_delete_orphan_auth_users default false) returns jsonb. SECURITY
--    DEFINER, search_path '', owner postgres, service_role only.
--    Preconditions (stable codes):
--      22004 invalid_argument       — tenant id / slug / flags null
--      P0002 tenant_not_found
--      P0001 confirm_slug_mismatch  — p_confirm_slug <> the tenant's slug (exact)
--      P0001 tenant_protected       — kind client_template (the onboarding
--                                     template; there is no separate
--                                     platform-staff tenant in the schema)
--      P0001 tenant_not_archived    — status must be 'archived' (archive first)
--    Dry run (default): returns the per-table row counts of every base table
--    with a uuid tenant_id column in the application schemas (discovered from
--    the catalog: everything except pg_*, information_schema, auth, storage,
--    extensions, api and the Supabase platform schemas), the audit / event
--    counts and digest, the tenant's storage objects (bucket + name; every
--    tenant media path starts with '<tenant_id>/', see 0052 / 0085 / 0095 /
--    0097) and the ids of "orphan" users: members of this tenant with no
--    membership and no role assignment in any other tenant, not platform
--    staff. Writes nothing.
--    Real run: same figures, then the tombstone row, then
--    set_config('oruwa.purge_tenant_id', ..., true), delete from core.tenants
--    (cascade), reset the setting, verify that no row with this tenant_id is
--    left anywhere (else P0001 purge_incomplete, everything rolls back), and,
--    only with p_delete_orphan_auth_users, delete the orphan users from
--    core.users and auth.users. Storage objects are NOT deleted here (Supabase
--    requires the Storage API); the result lists them for the runbook step.
--    core.tenant_provisioning rows keep the slug (their tenant_id FK is ON
--    DELETE SET NULL), so a purged slug stays reserved.
--
-- Rollback: commented block at the end of this file.
-- ============================================================================

-- --- 1. tombstone table ---------------------------------------------------------
create table audit.tenant_purge_log (
  id                       bigint generated always as identity primary key,
  tenant_id                uuid not null,
  tenant_slug              text not null,
  purged_at                timestamptz not null default now(),
  purged_by                text not null,
  row_counts               jsonb not null,
  audit_row_count          bigint not null,
  audit_digest             text not null,
  event_row_count          bigint not null,
  deleted_auth_user_count  integer not null default 0
);
create index tenant_purge_log_tenant_idx on audit.tenant_purge_log(tenant_id);
comment on table audit.tenant_purge_log is
  'Tombstone per physically purged tenant (0141, DEBT-103). Kept indefinitely. No FK to core.tenants. ids, slug, per-table row counts, audit/event counts and the sha256 hex of the tenant''s audit rows (jsonb_agg ordered by id) only -- no row content, no PII. Written only by core.purge_tenant.';

alter table audit.tenant_purge_log enable row level security;
revoke all on audit.tenant_purge_log from public, anon, authenticated, service_role;
grant select on audit.tenant_purge_log to service_role;

-- --- 2. append-only triggers: allow only the purge cascade ----------------------
create or replace function audit.prevent_mutation()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE'
     and old.tenant_id is not null
     and coalesce(current_setting('oruwa.purge_tenant_id', true), '') = old.tenant_id::text
     and not exists (select 1 from core.tenants t where t.id = old.tenant_id) then
    return old;
  end if;
  raise exception 'audit.audit_logs is append-only';
end;
$$;
comment on function audit.prevent_mutation() is
  'BEFORE UPDATE/DELETE trigger on audit.audit_logs (0005; 0141). UPDATE always refused. DELETE refused unless it is the FK cascade of core.purge_tenant: oruwa.purge_tenant_id = old.tenant_id AND that tenant row is already gone.';
revoke all on function audit.prevent_mutation() from public, anon, authenticated;

create or replace function core.prevent_event_mutation()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE'
     and old.tenant_id is not null
     and coalesce(current_setting('oruwa.purge_tenant_id', true), '') = old.tenant_id::text
     and not exists (select 1 from core.tenants t where t.id = old.tenant_id) then
    return old;
  end if;
  raise exception 'core.events is append-only';
end;
$$;
comment on function core.prevent_event_mutation() is
  'BEFORE UPDATE/DELETE trigger on core.events (0110; 0141). UPDATE always refused. DELETE refused unless it is the FK cascade of core.purge_tenant: oruwa.purge_tenant_id = old.tenant_id AND that tenant row is already gone.';
revoke all on function core.prevent_event_mutation() from public, anon, authenticated;

-- --- 3. core.purge_tenant ---------------------------------------------------------
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

  -- orphan users: member here, nowhere else (no membership, no role), not platform staff
  select coalesce(array_agg(m.user_id order by m.user_id), '{}'::uuid[]) into v_orphans
    from core.tenant_memberships m
    join core.users u on u.id = m.user_id
   where m.tenant_id = p_tenant_id
     and not u.is_platform_staff
     and not exists (select 1 from core.tenant_memberships o
                      where o.user_id = m.user_id and o.tenant_id <> p_tenant_id)
     and not exists (select 1 from core.role_assignments ra
                      where ra.user_id = m.user_id and ra.tenant_id <> p_tenant_id);

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
      'deleted_auth_user_count', 0);
  end if;

  -- real run: tombstone first, then the cascade
  if p_delete_orphan_auth_users then
    v_deleted := cardinality(v_orphans);
  end if;

  insert into audit.tenant_purge_log
    (tenant_id, tenant_slug, purged_by, row_counts, audit_row_count, audit_digest,
     event_row_count, deleted_auth_user_count)
  values
    (p_tenant_id, v_tenant.slug::text,
     concat_ws('/', session_user::text, nullif(current_setting('role', true), 'none')),
     v_counts, v_audit_n, v_audit_digest, v_event_n, v_deleted)
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

  if p_delete_orphan_auth_users and cardinality(v_orphans) > 0 then
    delete from core.users where id = any (v_orphans);
    get diagnostics v_n = row_count;
    if v_n <> cardinality(v_orphans) then
      raise exception 'orphan_user_delete_mismatch' using errcode = 'P0001';
    end if;
    delete from auth.users where id = any (v_orphans);
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
    'deleted_auth_user_count', v_deleted);
end;
$$;
comment on function core.purge_tenant(uuid, text, boolean, boolean) is
  'DEBT-103 (0141): physical deletion of an ARCHIVED tenant. p_confirm_slug must equal its slug; client_template tenants refused. Dry run (default) returns per-table row counts, audit/event counts + audit sha256 digest, storage objects (bucket/name, not deleted here: use the Storage API) and orphan user ids, writing nothing. Real run writes one audit.tenant_purge_log tombstone, then cascades the tenant delete (append-only triggers allow exactly this cascade), refuses if any tenant row is left (purge_incomplete), and with p_delete_orphan_auth_users deletes users whose only tenant was this one (core.users + auth.users). service_role only. Runbook: docs/operations/tenant-deletion-procedure.md.';

alter function core.purge_tenant(uuid, text, boolean, boolean) owner to postgres;
revoke all on function core.purge_tenant(uuid, text, boolean, boolean) from public, anon, authenticated;
grant execute on function core.purge_tenant(uuid, text, boolean, boolean) to service_role;

-- ============================================================================
-- Rollback (purged tenants stay purged; the tombstones are dropped with the table):
--   drop function if exists core.purge_tenant(uuid, text, boolean, boolean);
--   create or replace function core.prevent_event_mutation()
--   returns trigger language plpgsql as $$
--   begin
--     raise exception 'core.events is append-only';
--   end;
--   $$;
--   create or replace function audit.prevent_mutation()
--   returns trigger language plpgsql as $$
--   begin
--     raise exception 'audit.audit_logs is append-only';
--   end;
--   $$;
--   drop table if exists audit.tenant_purge_log;
-- ============================================================================
