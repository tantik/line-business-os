-- ============================================================================
-- 0072  Notifications engine: generic outbox for cross-module delivery
-- ----------------------------------------------------------------------------
-- Platform Foundation critical path, step 4 of 5
-- (docs/foundation/platform-foundation-roadmap.md S7/S10): Entitlements
-- (0069) -> Module Registry (0070) -> Shared Navigation/Settings (0071) ->
-- Notifications (this migration) -> Event Bus.
--
-- WHAT RESEARCH FOUND BEFORE WRITING THIS (the roadmap's own premise is
-- partly stale, checked rather than assumed):
--   * `apps/worker/src/jobs/booking-reminders.ts` does NOT actually send a
--     LINE message today -- it is a documented skeleton that builds a
--     message string in memory and discards it, with its own TODO citing
--     exactly this future service ("resolve tenant LINE channel + recipient
--     line id, then push ... insert a booking_events row for idempotency").
--   * Workforce has NO shift-notification send code at all.
--   * So there is no live "third implementation" to extract FROM yet -- the
--     value of this step is building the shared engine BEFORE a module
--     writes its own delivery/idempotency logic, not consolidating existing
--     duplicated code.
--   * The real duplication that already happened: `workforce
--     .employee_line_links` (0029) re-implements `core.line_accounts`'
--     (0004) identical encrypted+blind-index-hash linking pattern, scoped
--     to `workforce.employees` instead of reusing `core.line_accounts`.
--     This migration does NOT touch/consolidate that table (a real data
--     migration on an existing, reference-tenant-bearing table is its own
--     bounded, separately-approved task) -- flagging it here as durable
--     debt for a later pass, per this project's own "don't silently fix a
--     neighbor problem" discipline.
--   * The reusable LOW-level sender already exists:
--     `packages/line/src/messaging.ts`'s `LineMessagingClient` (`.push`/
--     `.reply`), and `core.line_channels`/`core.line_accounts` (0004) are
--     already the correct shared "who/how to reach this person on LINE"
--     model -- `booking.bookings.line_account_id` already references
--     `core.line_accounts.id` directly, confirming that table (not a new
--     recipient concept) is the right key for a LINE-channel notification.
--
-- SCOPE OF THIS MIGRATION: the generic outbox table + enforcement, and an
-- app-level enqueue/status wrapper. It deliberately does NOT wire
-- `booking-reminders.ts` (or anything else) to actually call
-- `LineMessagingClient.push` and deliver a real message, and does NOT add a
-- dispatch job to `apps/worker`'s cron loop. Actually causing LINE messages
-- to go out to real customers is exactly the "LINE broadcast/mass
-- messaging" category `CLAUDE.md` requires explicit human approval for,
-- separate from and in addition to this migration's approval. Building the
-- enqueue/outbox engine now (so the NEXT thing any module writes is a call
-- into this table, not its own ad hoc send+idempotency logic) is safe;
-- flipping on real delivery is a distinct, later, explicitly-approved step.
--
-- WHY A SINGLE-VALUE `channel` ENUM ISN'T PREMATURE: the roadmap's own text
-- says "LINE as the first channel, but not the only one" -- modeling
-- `channel` as an enum (cheap to extend later via `ALTER TYPE ... ADD
-- VALUE`) reflects an already-stated intent, not an invented one. The
-- recipient column stays LINE-specific (`recipient_line_account_id`) rather
-- than a generic polymorphic recipient, because a second channel doesn't
-- exist yet to design that generalization correctly against (Core Law 1 /
-- Filter 6: don't abstract from one example).
--
-- WHY template_key/template_params, NOT RENDERED TEXT: mirrors
-- booking-reminders.ts's own existing discipline (PII decrypted only
-- in-memory at send time, never persisted plaintext) and
-- `packages/core/src/audit.ts`'s `redactPII` precedent -- the outbox itself
-- must stay PII-light; a dispatch worker resolves display content at send
-- time from `template_params`' ids.
-- ============================================================================

do $$ begin
  create type core.notification_channel as enum ('line');
exception when duplicate_object then null; end $$;

do $$ begin
  create type core.notification_status as enum ('pending', 'sent', 'failed', 'canceled');
exception when duplicate_object then null; end $$;

create table if not exists core.notifications (
  id                          uuid primary key default gen_random_uuid(),
  tenant_id                   uuid not null references core.tenants(id) on delete cascade,
  module                      core.module_code not null,
  channel                     core.notification_channel not null default 'line',
  recipient_line_account_id   uuid not null references core.line_accounts(id) on delete cascade,
  idempotency_key             text not null,
  template_key                text not null,
  template_params             jsonb not null default '{}'::jsonb,
  status                      core.notification_status not null default 'pending',
  attempt_count               integer not null default 0,
  last_error                  text,
  created_at                  timestamptz not null default now(),
  sent_at                     timestamptz,
  updated_at                  timestamptz not null default now(),
  unique (tenant_id, module, idempotency_key)
);
create index if not exists notifications_tenant_idx on core.notifications(tenant_id);
create index if not exists notifications_pending_idx on core.notifications(status) where status = 'pending';
comment on table core.notifications is
  'Generic cross-module notification outbox. Enqueue via packages/core/src/notifications.ts; no dispatch worker exists yet (see migration header -- actual delivery is a separate, explicitly-approved step, not this migration). template_params holds structured ids only, never rendered PII text.';

do $$
declare t text;
begin
  foreach t in array array['core.notifications'] loop
    execute format(
      'drop trigger if exists set_updated_at on %s; '
      'create trigger set_updated_at before update on %s '
      'for each row execute function core.set_updated_at();', t, t);
  end loop;
end $$;

-- --- RLS ---------------------------------------------------------------------
alter table core.notifications enable row level security;

-- Members may read their own tenant's notification history (not sensitive
-- beyond tenant-membership boundary -- content is template_key/params, not
-- rendered PII). Writes are system-generated only: no INSERT/UPDATE/DELETE
-- grant to `authenticated` at all, same as audit.audit_logs (0005/0007) --
-- the write policy below exists as the documented boundary for a future
-- direct-write path, not because one exists today.
drop policy if exists notifications_select on core.notifications;
create policy notifications_select on core.notifications
  for select using (core.is_member_of(tenant_id));

drop policy if exists notifications_write on core.notifications;
create policy notifications_write on core.notifications
  for all using (core.is_platform_staff())
  with check (core.is_platform_staff());

grant select on core.notifications to authenticated;
revoke all on core.notifications from anon;
