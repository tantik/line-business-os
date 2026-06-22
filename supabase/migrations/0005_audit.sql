-- ============================================================================
-- 0005  Audit log
-- ----------------------------------------------------------------------------
-- Append-only audit trail. Every mutating backend action should write a row.
-- Records: actor, tenant, module, entity, action, before/after, timestamp.
-- ============================================================================

create table if not exists audit.audit_logs (
  id          bigint generated always as identity primary key,
  tenant_id   uuid not null references core.tenants(id) on delete cascade,
  actor_id    uuid references core.users(id) on delete set null, -- null = system/AI
  actor_kind  text not null default 'user',  -- 'user' | 'system' | 'ai'
  module      core.module_code not null,
  entity      text not null,                 -- e.g. 'booking', 'shift'
  entity_id   text,                          -- affected row id (text for flexibility)
  action      text not null,                 -- e.g. 'create' | 'update' | 'approve'
  -- before/after recorded only when safe (no raw PII; redact at app layer).
  before      jsonb,
  after       jsonb,
  metadata    jsonb not null default '{}'::jsonb,
  ip_address  inet,
  created_at  timestamptz not null default now()
);
create index if not exists audit_logs_tenant_idx on audit.audit_logs(tenant_id, created_at desc);
create index if not exists audit_logs_entity_idx on audit.audit_logs(tenant_id, entity, entity_id);
comment on table audit.audit_logs is 'Append-only audit trail across all modules.';

-- Prevent updates/deletes to keep the trail tamper-evident at the DB level.
create or replace function audit.prevent_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'audit.audit_logs is append-only';
end;
$$;

drop trigger if exists audit_logs_no_update on audit.audit_logs;
create trigger audit_logs_no_update
  before update or delete on audit.audit_logs
  for each row execute function audit.prevent_mutation();
