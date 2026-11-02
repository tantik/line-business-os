-- ============================================================================
-- 0149 — Tenant purge: rows the tenant cascade cannot reach (DEBT-103 c)
-- ----------------------------------------------------------------------------
-- Runbook: docs/operations/tenant-deletion-procedure.md.
--
-- Found on Cloud DEV while purging mame-to-cha (2026-11-02): the real run
-- failed (and rolled back) with 23503 inventory_stock_counts_location_tenant_fkey.
-- Some tables carry tenant_id without an FK to core.tenants
-- (inventory.stock_counts, purchases.purchase_actions,
-- purchases.spend_receipt_items, workforce.recipe_ingredients / recipe_notes /
-- recipe_steps). Their rows hang off other tenant rows through NO ACTION
-- FKs (stock_counts -> core.locations / inventory.items), so
-- `delete from core.tenants` cascades into the parent and stops there. The
-- qa-4c-cafe-7 purge and pgTAP 0080 had no such rows.
--
-- core.purge_tenant (same signature, same result as 0148) now deletes, in the
-- real run and right before the tenant row, the tenant's rows of every table
-- that has a uuid tenant_id and no ON DELETE CASCADE / SET NULL / SET DEFAULT
-- FK to core.tenants (discovered from the catalog, so a future table of that
-- shape is covered; the dry run lists them as uncascaded_tables). Several
-- passes, each delete in its own subtransaction: one blocked by an FK from
-- another such table (23503 / 23001) is retried in the next pass; a pass
-- without progress that leaves a table blocked raises P0001
-- purge_blocked: <tables> and everything rolls back. Only those two
-- SQLSTATEs are caught; a DEFERRABLE FK (none today) would fail at commit,
-- still rolling back. Tables reached by the cascade are left to it on
-- purpose (their triggers, e.g. workforce.employees' 0138 / 0140 ones, treat
-- "tenant row gone" as the purge case). audit.tenant_purge_log is never
-- touched.
-- Rule: a future table whose rows must OUTLIVE the tenant (e.g. billing kept
-- for legal retention) must not carry a plain tenant_id without an FK, or be
-- added to the exclusions of every catalog loop in this function.
--
-- Rollback: re-run section 2 of 0148_core_purge_orphan_users.sql.
-- ============================================================================

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
  v_progress boolean;
  v_uncascaded text[];
  v_blocked text[];
  v_tbl text;
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

  -- tables the cascade cannot reach: uuid tenant_id, no CASCADE / SET NULL /
  -- SET DEFAULT FK to core.tenants (deleted before the cascade in the real run)
  select coalesce(array_agg(format('%I.%I', n.nspname, c.relname) order by n.nspname, c.relname), '{}'::text[])
    into v_uncascaded
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    join pg_catalog.pg_attribute a on a.attrelid = c.oid
   where a.attname = 'tenant_id' and not a.attisdropped
     and a.atttypid = 'pg_catalog.uuid'::pg_catalog.regtype
     and c.relkind in ('r', 'p') and not c.relispartition
     and n.nspname <> all (c_excluded_schemas)
     and n.nspname not like 'pg\_%'
     and not (n.nspname = 'audit' and c.relname = 'tenant_purge_log')
     and not exists (select 1 from pg_catalog.pg_constraint k
                      where k.conrelid = c.oid and k.contype = 'f'
                        and k.confrelid = 'core.tenants'::pg_catalog.regclass
                        and k.confdeltype in ('c', 'n', 'd'));

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
      'uncascaded_tables', to_jsonb(v_uncascaded),
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

  -- rows the cascade cannot reach (v_uncascaded); passes, each delete in a
  -- subtransaction; a table still blocked after a pass without progress stops
  -- the purge (everything rolls back)
  loop
    v_progress := false;
    v_blocked := '{}'::text[];
    foreach v_tbl in array v_uncascaded loop
      begin
        execute format('delete from %s where tenant_id = $1', v_tbl) using p_tenant_id;
        get diagnostics v_n = row_count;
        if v_n > 0 then
          v_progress := true;
        end if;
      exception when foreign_key_violation or restrict_violation then
        v_blocked := v_blocked || v_tbl;
      end;
    end loop;
    exit when cardinality(v_blocked) = 0;
    if not v_progress then
      raise exception 'purge_blocked: %', array_to_string(v_blocked, ', ') using errcode = 'P0001';
    end if;
  end loop;

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
    'uncascaded_tables', to_jsonb(v_uncascaded),
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
  'DEBT-103 (0141; orphan rule 0148; uncascaded rows 0149): physical deletion of an ARCHIVED tenant. p_confirm_slug must equal its slug; client_template tenants refused. Dry run (default) returns per-table row counts, audit/event counts + audit sha256 digest, storage objects (bucket/name, not deleted here: use the Storage API) and orphan candidates (members, role holders, linked employees and invitees of this tenant that nothing outside it references, not platform staff), writing nothing. Real run writes one audit.tenant_purge_log tombstone, deletes the tenant rows of tables without a cascading FK to core.tenants (passes), then cascades the tenant delete (append-only triggers allow exactly this cascade), refuses if any tenant row is left (purge_incomplete), and with p_delete_orphan_auth_users deletes the candidates nothing references after the cascade (core.users + auth.users; deleted_user_ids). service_role only. Runbook: docs/operations/tenant-deletion-procedure.md.';

alter function core.purge_tenant(uuid, text, boolean, boolean) owner to postgres;
revoke all on function core.purge_tenant(uuid, text, boolean, boolean) from public, anon, authenticated;
grant execute on function core.purge_tenant(uuid, text, boolean, boolean) to service_role;
