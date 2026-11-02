# Tenant deletion procedure

Closes DEBT-103. Migrations `supabase/migrations/0141_core_tenant_purge.sql`,
`0148_core_purge_orphan_users.sql` (orphan rule, unreferenced users) and
`0149_core_purge_tenant_uncascaded_rows.sql` (rows the cascade cannot
reach), tests `supabase/tests/0080_core_tenant_purge.sql`,
`0087_core_purge_orphan_users.sql` and `0088_core_purge_uncascaded_rows.sql`.

A tenant is physically deleted only through `core.purge_tenant`. Plain
`delete from core.tenants` still fails as soon as the tenant has audit or
event rows: `audit.audit_logs` and `core.events` stay append-only and only
let the purge cascade through.

## Policy

1. **Archive first.** Set the tenant to `status = 'archived'` (no members
   with access, modules off). An archived tenant keeps all its data.
2. **Grace period: 30 days** after archiving (default). Shorter only for
   test / smoke / QA tenants with no real customer data.
3. **Export offered** to the customer during the grace period. The export
   itself is future work: there is no export tool yet, so today the
   decision to purge without an export must be recorded in the request.
4. **Purge** with `core.purge_tenant` (dry run, then real run), then delete
   the tenant's Storage objects through the Storage API.
5. **Tombstone kept indefinitely.** Every real run writes one row to
   `audit.tenant_purge_log`: tenant id, slug, time, who ran it (session
   role), per-table row counts, audit / event row counts and the sha256 of
   the tenant's audit rows (ids and counts only, no content, no PII).
6. **Production: Founder-approved only.** Every step below that touches
   production needs explicit Founder approval for that tenant. Cloud DEV
   purges are the Lead's call.

## What the function does

`core.purge_tenant(p_tenant_id uuid, p_confirm_slug text, p_dry_run boolean default true, p_delete_orphan_auth_users boolean default false) returns jsonb`

- `service_role` / `postgres` only (not callable from a browser session).
- Refuses: `invalid_argument` (22004, null argument), `tenant_not_found`
  (P0002), `confirm_slug_mismatch` (slug must match exactly),
  `tenant_protected` (`kind = 'client_template'`), `tenant_not_archived`.
- Dry run (default) writes nothing and returns:
  `row_counts` (every application table with a `tenant_id` column, non-zero
  only, plus `core.tenants`), `audit_row_count`, `audit_digest`,
  `event_row_count`, `storage_objects` (`bucket` + `name`) and
  `storage_object_count`, `orphan_user_ids` / `orphan_user_count`: people
  of this tenant (membership, role, employee link, employee or Owner
  invitation in any status, so also invitees who never accepted) that
  nothing outside this tenant references (no row of any table with a
  foreign key to `core.users`, found from the catalog), not platform staff.
- Real run: writes the tombstone, first deletes the tenant's rows of tables
  that have `tenant_id` but no cascading FK to `core.tenants` (e.g.
  `inventory.stock_counts`, `purchases.purchase_actions`; found from the
  catalog, listed as `uncascaded_tables` in the dry run, several passes;
  a table that stays blocked stops the purge with `purge_blocked`), then
  deletes the tenant (FK cascade), fails
  with `purge_incomplete` and rolls everything back if any row with that
  `tenant_id` is left, and only with `p_delete_orphan_auth_users = true`
  deletes from `core.users` and `auth.users` those candidates that nothing
  references any more after the cascade (`deleted_user_ids`; a candidate
  still referenced, e.g. by a provisioning row, is kept, not an error).
- Storage objects are **not** deleted by the function (Supabase requires
  the Storage API). Every tenant media path starts with `<tenant_id>/`
  (`recipe-media`, `inventory-media`: `<tenant>/<location>/<entity>/<file>`),
  so the result lists every object of the tenant in any bucket.
- `core.tenant_provisioning` rows keep their slug (`tenant_id` becomes
  null), so the slug of a purged tenant stays reserved.
- Schema rule: every row with the tenant's `tenant_id` is deleted. A future
  table whose rows must outlive the tenant (e.g. billing kept for legal
  retention) needs `on delete set null` on its `tenant_id` FK or an explicit
  exclusion in `core.purge_tenant`.

## Steps on Cloud DEV

Run from the main checkout, which is already linked to Cloud DEV. Never run
`supabase link`, `db pull` or `migration repair`. Write each SQL statement
to a file outside the repo (for example the session scratchpad).

1. Find the tenant and check its status:

   ```sql
   select id, slug, kind, status, updated_at from core.tenants where slug = '<slug>';
   ```

   If it is not archived, archive it first and wait out the grace period
   (see Policy).

2. Dry run (`purge-dry.sql`):

   ```sql
   select core.purge_tenant('<tenant_id>', '<slug>', true, false);
   ```

   ```sh
   npx supabase db query --linked -f purge-dry.sql -o json
   ```

   Keep the JSON output with the purge request. Check `row_counts`,
   `storage_objects` and `orphan_user_ids` (decide whether those users
   should be deleted: a user with no other tenant has no use for the
   account any more).

3. Real run (`purge-real.sql`), with the orphan-user flag decided in step 2:

   ```sql
   select core.purge_tenant('<tenant_id>', '<slug>', false, <true|false>);
   ```

   ```sh
   npx supabase db query --linked -f purge-real.sql -o json
   ```

   The output must show the same `row_counts`, `audit_row_count` and
   `audit_digest` as the dry run (unless the tenant changed in between).

4. Storage cleanup, for each `storage_objects` entry of the result:

   ```sh
   npx supabase storage rm --experimental --linked "ss:///<bucket>/<name>"
   ```

   Or one call per bucket for the whole tenant prefix:

   ```sh
   npx supabase storage rm --experimental --linked -r "ss:///recipe-media/<tenant_id>"
   npx supabase storage rm --experimental --linked -r "ss:///inventory-media/<tenant_id>"
   ```

5. Verify:

   ```sql
   -- tenant gone, one tombstone
   select count(*) from core.tenants where id = '<tenant_id>';                      -- 0
   select id, tenant_slug, purged_at, purged_by, audit_row_count, audit_digest,
          event_row_count, deleted_auth_user_count, row_counts
     from audit.tenant_purge_log where tenant_id = '<tenant_id>';                   -- 1 row
   -- nothing of the tenant left
   select count(*) from audit.audit_logs where tenant_id = '<tenant_id>';           -- 0
   select count(*) from core.events where tenant_id = '<tenant_id>';                -- 0
   select count(*) from storage.objects where split_part(name, '/', 1) = '<tenant_id>'; -- 0 after step 4
   -- deleted orphan users (only when the flag was true)
   select count(*) from auth.users where id = any ('{<orphan ids>}'::uuid[]);      -- 0
   ```

6. Unreferenced users. Users whose memberships were removed when the
   tenant was archived by hand are no longer linked to it at purge time,
   so the purge cannot see them. List every user nothing references
   (`users-dry.sql`):

   ```sql
   select core.purge_unreferenced_users('{}'::uuid[]);
   ```

   The result has ids, `auth_created_at` and `last_sign_in_at` only (look
   up the email in `auth.users` if needed). Pick the ids to delete, check
   them, then delete (`users-real.sql`):

   ```sql
   select core.purge_unreferenced_users('{<ids>}'::uuid[], true);   -- check
   select core.purge_unreferenced_users('{<ids>}'::uuid[], false);  -- delete
   ```

   The call refuses the whole list if one id is unknown, platform staff or
   still referenced. Each deleted user gets one `audit.user_purge_log` row
   (orphans deleted by the purge itself get one too, with the tombstone id).
   Run it when nobody is inviting these people (the functions lock the
   user rows, but `core.users` has no FK to `auth.users`, so an invite that
   resolves an auth-only user at the same moment is not blocked). The
   listing checks every FK column for every user: fine on Cloud DEV, slow
   on a large database. On production the user list needs Founder approval
   like the purge.

7. Record the purge (tenant, date, tombstone id, storage cleanup done) in
   `docs/ai/current-task.md` or the relevant debt / QA entry.

## Production

Same steps, against production, **only after explicit Founder approval** for
the named tenant, after the grace period, and with the dry-run output shown
to the Founder before the real run.

## Rollback

There is no undo for a real run (the transaction commits). The dry run is
the safety check. A real run that fails (`purge_incomplete`, a foreign key
error, an orphan-user delete error) rolls back completely and writes no
tombstone.
