-- ============================================================================
-- DB test: Notifications engine (migration 0072_core_notifications_engine.sql)
-- ----------------------------------------------------------------------------
-- Run with:  pnpm exec supabase db reset && pnpm exec supabase test db
--
-- Proves:
--   * RLS is enabled on core.notifications.
--   * A member can read their own tenant's notifications; not another
--     tenant's.
--   * No INSERT/UPDATE/DELETE grant exists for `authenticated` (system-
--     generated only, same convention as audit.audit_logs) -- even a
--     platform-staff-holding write attempt via the authenticated role fails
--     at the table-grant level, not just RLS.
--   * unique(tenant_id, module, idempotency_key) actually rejects a second
--     insert with the same key (the idempotency guarantee the enqueue
--     wrapper relies on).
-- ============================================================================

begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core;
select no_plan();

create function pg_temp.as_auth_exec(p_sub text, p_sql text)
returns boolean language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('app.current_user_id', '', true);
  perform set_config('request.jwt.claims', json_build_object('sub', coalesce(p_sub, ''))::text, true);
  set local role authenticated;
  execute p_sql;
  reset role;
  return true;
exception when others then
  raise notice 'as_auth_exec failed: %', sqlerrm;
  reset role;
  return false;
end;
$$;

create function pg_temp.as_auth_bool(p_sub text, p_sql text)
returns boolean language plpgsql as $$
declare b boolean;
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('app.current_user_id', '', true);
  perform set_config('request.jwt.claims', json_build_object('sub', coalesce(p_sub, ''))::text, true);
  set local role authenticated;
  execute p_sql into b;
  reset role;
  return b;
end;
$$;

-- --- RLS enabled ---------------------------------------------------------------
select ok(
  (select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'core' and c.relname = 'notifications'),
  'RLS is enabled on core.notifications'
);

-- ============================================================================
-- Fixtures
-- ============================================================================

insert into core.tenants (id, slug, name) values
  ('ec600000-0000-0000-0000-000000000001', 'pgtap-notifications-tenant-a', 'pgTAP Notifications A'),
  ('ec600000-0000-0000-0000-000000000002', 'pgtap-notifications-tenant-b', 'pgTAP Notifications B');
insert into core.users (id, display_name, is_platform_staff) values
  ('ec620000-0000-0000-0000-000000000001', 'Tenant A Member', false),
  ('ec620000-0000-0000-0000-000000000002', 'Platform Staff', true);
insert into core.tenant_memberships (tenant_id, user_id, status) values
  ('ec600000-0000-0000-0000-000000000001', 'ec620000-0000-0000-0000-000000000001', 'active');
insert into core.line_accounts (id, tenant_id, line_user_id_encrypted, line_user_id_hash) values
  ('ec630000-0000-0000-0000-000000000001', 'ec600000-0000-0000-0000-000000000001', '\x00'::bytea, 'pgtap-hash-a'),
  ('ec630000-0000-0000-0000-000000000002', 'ec600000-0000-0000-0000-000000000002', '\x00'::bytea, 'pgtap-hash-b');
insert into core.notifications (tenant_id, module, recipient_line_account_id, idempotency_key, template_key) values
  ('ec600000-0000-0000-0000-000000000001', 'booking', 'ec630000-0000-0000-0000-000000000001', 'booking-reminder-1', 'booking.reminder'),
  ('ec600000-0000-0000-0000-000000000002', 'booking', 'ec630000-0000-0000-0000-000000000002', 'booking-reminder-2', 'booking.reminder');

-- --- select ----------------------------------------------------------------------
select ok(
  pg_temp.as_auth_bool('ec620000-0000-0000-0000-000000000001',
    $q$ select exists (select 1 from core.notifications where tenant_id = 'ec600000-0000-0000-0000-000000000001') $q$),
  'a tenant A member can select their own tenant''s notifications'
);
select ok(
  not pg_temp.as_auth_bool('ec620000-0000-0000-0000-000000000001',
    $q$ select exists (select 1 from core.notifications where tenant_id = 'ec600000-0000-0000-0000-000000000002') $q$),
  'a tenant A member cannot select tenant B''s notifications'
);

-- --- write: no grant to authenticated at all, even for platform staff ------------
select ok(
  not pg_temp.as_auth_exec('ec620000-0000-0000-0000-000000000002',
    $q$ insert into core.notifications (tenant_id, module, recipient_line_account_id, idempotency_key, template_key)
        values ('ec600000-0000-0000-0000-000000000001', 'booking', 'ec630000-0000-0000-0000-000000000001', 'x', 'x') $q$),
  'even platform staff cannot INSERT via the authenticated role -- no table grant exists (system-generated only, same as audit.audit_logs)'
);

-- --- idempotency: unique(tenant_id, module, idempotency_key) --------------------
select throws_like(
  $$ insert into core.notifications (tenant_id, module, recipient_line_account_id, idempotency_key, template_key)
     values ('ec600000-0000-0000-0000-000000000001', 'booking', 'ec630000-0000-0000-0000-000000000001', 'booking-reminder-1', 'booking.reminder') $$,
  'duplicate key value violates unique constraint%',
  'a second insert with the same (tenant, module, idempotency_key) is rejected'
);

select * from finish();
rollback;
