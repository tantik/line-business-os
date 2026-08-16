-- ============================================================================
-- DB test: Event Bus (migration 0073_core_event_bus.sql)
-- ----------------------------------------------------------------------------
-- Run with:  pnpm exec supabase db reset && pnpm exec supabase test db
--
-- Proves:
--   * RLS is enabled on core.events.
--   * A member can read their own tenant's events; not another tenant's.
--   * core.events is append-only: UPDATE and DELETE are rejected by the
--     trigger, same as audit.audit_logs (0005).
--   * No INSERT grant exists for `authenticated` at all (system-generated
--     only, same convention as audit.audit_logs/core.notifications).
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
    where n.nspname = 'core' and c.relname = 'events'),
  'RLS is enabled on core.events'
);

-- ============================================================================
-- Fixtures
-- ============================================================================

insert into core.tenants (id, slug, name) values
  ('ed600000-0000-0000-0000-000000000001', 'pgtap-event-bus-tenant-a', 'pgTAP Event Bus A'),
  ('ed600000-0000-0000-0000-000000000002', 'pgtap-event-bus-tenant-b', 'pgTAP Event Bus B');
insert into core.users (id, display_name, is_platform_staff) values
  ('ed620000-0000-0000-0000-000000000001', 'Tenant A Member', false),
  ('ed620000-0000-0000-0000-000000000002', 'Platform Staff', true);
insert into core.tenant_memberships (tenant_id, user_id, status) values
  ('ed600000-0000-0000-0000-000000000001', 'ed620000-0000-0000-0000-000000000001', 'active');
insert into core.events (tenant_id, module, event_type, payload) values
  ('ed600000-0000-0000-0000-000000000001', 'inventory', 'inventory.stock.low', '{"item_id":"x"}'::jsonb),
  ('ed600000-0000-0000-0000-000000000002', 'inventory', 'inventory.stock.low', '{"item_id":"y"}'::jsonb);

-- --- select ----------------------------------------------------------------------
select ok(
  pg_temp.as_auth_bool('ed620000-0000-0000-0000-000000000001',
    $q$ select exists (select 1 from core.events where tenant_id = 'ed600000-0000-0000-0000-000000000001') $q$),
  'a tenant A member can select their own tenant''s events'
);
select ok(
  not pg_temp.as_auth_bool('ed620000-0000-0000-0000-000000000001',
    $q$ select exists (select 1 from core.events where tenant_id = 'ed600000-0000-0000-0000-000000000002') $q$),
  'a tenant A member cannot select tenant B''s events'
);

-- --- write: no INSERT grant to authenticated at all -------------------------------
select ok(
  not pg_temp.as_auth_exec('ed620000-0000-0000-0000-000000000002',
    $q$ insert into core.events (tenant_id, module, event_type)
        values ('ed600000-0000-0000-0000-000000000001', 'inventory', 'x.y') $q$),
  'even platform staff cannot INSERT via the authenticated role -- no table grant exists (system-generated only)'
);

-- --- append-only ------------------------------------------------------------------
select throws_ok(
  $$ update core.events set event_type = 'tampered'
       where tenant_id = 'ed600000-0000-0000-0000-000000000001' and event_type = 'inventory.stock.low' $$,
  'core.events is append-only',
  'core.events UPDATE is rejected (append-only)'
);
select throws_ok(
  $$ delete from core.events
       where tenant_id = 'ed600000-0000-0000-0000-000000000001' and event_type = 'inventory.stock.low' $$,
  'core.events is append-only',
  'core.events DELETE is rejected (append-only)'
);

select * from finish();
rollback;
