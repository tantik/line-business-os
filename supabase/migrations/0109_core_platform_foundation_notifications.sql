-- ============================================================================
-- 0109  Platform Foundation reconciliation (4/5) — Notifications outbox
-- ----------------------------------------------------------------------------
-- Forward-only reconciliation of the Platform Foundation "Notifications
-- engine" (critical path step 4/5, historically `main`'s 0072). See 0106's
-- header and docs/ai/PLATFORM_FOUNDATION_RECONCILIATION_HANDOFF_2026-08-29.md.
--
-- Generic cross-module notification OUTBOX only. No dispatch worker, nothing
-- that actually sends a LINE message (that is the "LINE broadcast/mass
-- messaging" category CLAUDE.md gates separately, and is not this file).
-- `template_key`/`template_params` hold structured ids only, never rendered
-- PII text. Writes are system-generated (platform-staff-only policy); no
-- INSERT/UPDATE/DELETE grant to `authenticated`.
--
-- DUAL-TARGET: explicit type guards, create-if-not-exists, drop-and-recreate
-- policies. Converges on Cloud dev (present, byte-exact) and creates on a
-- fresh local reset. No `EXCEPTION WHEN others`.
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'core' and t.typname = 'notification_channel') then
    create type core.notification_channel as enum ('line');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'core' and t.typname = 'notification_status') then
    create type core.notification_status as enum ('pending', 'sent', 'failed', 'canceled');
  end if;
end $$;

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
  'Generic cross-module notification outbox. Enqueue via packages/core/src/notifications.ts; no dispatch worker exists yet -- actual delivery is a separate, explicitly-approved step. template_params holds structured ids only, never rendered PII text.';

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

alter table core.notifications enable row level security;

drop policy if exists notifications_select on core.notifications;
create policy notifications_select on core.notifications
  for select using (core.is_member_of(tenant_id));

drop policy if exists notifications_write on core.notifications;
create policy notifications_write on core.notifications
  for all using (core.is_platform_staff()) with check (core.is_platform_staff());

grant select on core.notifications to authenticated;
revoke all on core.notifications from anon;

-- ============================================================================
-- Rollback (fresh-DB only, NOT Cloud dev):
--   drop table if exists core.notifications;
--   drop type if exists core.notification_status;
--   drop type if exists core.notification_channel;
-- ============================================================================
