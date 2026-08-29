-- ============================================================================
-- 0110  Platform Foundation reconciliation (5/5) — Event Bus
-- ----------------------------------------------------------------------------
-- Forward-only reconciliation of the Platform Foundation "Event Bus" (critical
-- path step 5/5, historically `main`'s 0073). See 0106's header and
-- docs/ai/PLATFORM_FOUNDATION_RECONCILIATION_HANDOFF_2026-08-29.md.
--
-- Append-only cross-module event log (the "publish" side). No consumer /
-- subscription registry — that is added the first time a real subscriber
-- needs one. Modeled like audit.audit_logs (immutable): an event is a fact,
-- not a task with a lifecycle. `payload` holds structured ids only.
--
-- DUAL-TARGET: create-if-not-exists / create-or-replace / drop-and-recreate.
-- Converges on Cloud dev (present, byte-exact) and creates on a fresh local
-- reset.
-- ============================================================================

create table if not exists core.events (
  id          bigint generated always as identity primary key,
  tenant_id   uuid not null references core.tenants(id) on delete cascade,
  module      core.module_code not null,
  event_type  text not null,
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists events_tenant_idx on core.events(tenant_id, created_at desc);
create index if not exists events_type_idx on core.events(tenant_id, event_type, created_at desc);
comment on table core.events is
  'Append-only cross-module event log (the Event Bus "publish" side). Publish via packages/core/src/events.ts''s publishEvent. No consumer/subscription registry exists yet. payload holds structured ids only, never rendered PII text.';

create or replace function core.prevent_event_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'core.events is append-only';
end;
$$;

drop trigger if exists events_no_update on core.events;
create trigger events_no_update
  before update or delete on core.events
  for each row execute function core.prevent_event_mutation();

alter table core.events enable row level security;

drop policy if exists events_select on core.events;
create policy events_select on core.events
  for select using (core.is_member_of(tenant_id));

drop policy if exists events_write on core.events;
create policy events_write on core.events
  for insert with check (core.is_platform_staff());

grant select on core.events to authenticated;
revoke all on core.events from anon;

-- ============================================================================
-- Rollback (fresh-DB only, NOT Cloud dev):
--   drop trigger if exists events_no_update on core.events;
--   drop function if exists core.prevent_event_mutation();
--   drop table if exists core.events;
-- ============================================================================
