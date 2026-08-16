-- ============================================================================
-- 0073  Event Bus: append-only cross-module event log
-- ----------------------------------------------------------------------------
-- Platform Foundation critical path, step 5 of 5 (the last one)
-- (docs/foundation/platform-foundation-roadmap.md S7/S10): Entitlements
-- (0069) -> Module Registry (0070) -> Shared Navigation/Settings (0071) ->
-- Notifications (0072) -> Event Bus (this migration).
--
-- WHAT RESEARCH FOUND BEFORE WRITING THIS (same discipline as the prior 4
-- steps -- verify the roadmap's premise against the actual repo, don't
-- assume it): there is NO live cross-module coupling to fix today. No
-- module reads/writes another module's schema; no package imports another
-- module's package; `ai.proposals` (the roadmap's own cited "AI proposes ->
-- human approves" precedent) has no caller anywhere in the repo. Modules
-- are already fully decoupled. This matches the roadmap's own explicit
-- permission (S8): "Event Bus can wait for the first real decoupled
-- cross-module scenario -- but no later than the 3rd vertical." There is no
-- refactor to do here; this migration builds the PRIMITIVE ahead of need,
-- exactly as the roadmap allows, so the third vertical (or any new
-- cross-module reaction on the current three) has something to publish/
-- read from instead of reaching for a direct call or a direct cross-schema
-- query.
--
-- SCOPE: an append-only event log (`core.events`, the "publish" side) plus
-- a poll-since helper (the "subscribe" side). Deliberately NOT a full
-- consumer-group/delivery-tracking system (a `core.event_subscriptions` +
-- per-subscription delivery-status table): with zero current producers and
-- zero current consumers, building fan-out delivery bookkeeping now would
-- be designing against a hypothetical, not a real requirement (Core Law 1 /
-- Filter 6 -- already the same reasoning applied when 0072 kept Notifications
-- LINE-recipient-specific instead of inventing a generic recipient model).
-- A dispatcher/consumer-registry can be added the first time a real
-- subscriber needs one.
--
-- WHY MODELED LIKE audit.audit_logs (append-only, immutable), NOT LIKE
-- core.notifications (mutable status/attempt_count): an event is a fact
-- that happened ("inventory.stock.low fired"), not a task with a lifecycle
-- ("this notification was sent"). Facts don't get retried or fail; a
-- consumer's own read-cursor (its own bookkeeping, not this table) decides
-- what to do with a fact it already has. Reuses the identical append-only
-- enforcement shape as `audit.prevent_mutation()` (0005), with its own
-- table-specific exception function/message.
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
  'Append-only cross-module event log (the Event Bus "publish" side). Publish via packages/core/src/events.ts''s publishEvent. No consumer/subscription registry exists yet -- see migration header. payload holds structured ids only, never rendered PII text, same discipline as core.notifications (0072).';

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

-- --- RLS ---------------------------------------------------------------------
alter table core.events enable row level security;

-- Members may read their own tenant's event log (not sensitive beyond
-- tenant-membership boundary -- payload is structured ids, not PII). Writes
-- are system-generated only: no INSERT grant to `authenticated` at all,
-- same convention as audit.audit_logs and core.notifications (0072). The
-- policy below documents the boundary for a future direct-write path, same
-- as 0072's notifications_write.
drop policy if exists events_select on core.events;
create policy events_select on core.events
  for select using (core.is_member_of(tenant_id));

drop policy if exists events_write on core.events;
create policy events_write on core.events
  for insert with check (core.is_platform_staff());

grant select on core.events to authenticated;
revoke all on core.events from anon;
