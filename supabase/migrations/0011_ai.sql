-- ============================================================================
-- 0011  Module: ai  (proposals + prompt logs)
-- ----------------------------------------------------------------------------
-- AI-first rule: AI proposes -> Manager approves -> Backend applies -> Audit.
-- AI never mutates business data directly. Proposals are tenant-scoped and
-- carry the target module/entity + proposed change for human review.
-- ============================================================================

create schema if not exists ai;
comment on schema ai is 'AI agent contracts: proposals (human-in-the-loop) and prompt logs.';

do $$ begin
  create type ai.proposal_status as enum (
    'proposed', 'approved', 'rejected', 'applied', 'failed', 'expired'
  );
exception when duplicate_object then null; end $$;

-- Proposals: a requested change awaiting human approval before application ---
create table if not exists ai.proposals (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references core.tenants(id) on delete cascade,
  location_id   uuid references core.locations(id) on delete set null,
  module        core.module_code not null,
  entity        text not null,             -- target table/aggregate
  entity_id     text,                      -- target row (null for create)
  action        text not null,             -- create | update | delete | custom
  -- The concrete change the AI wants applied (validated at apply time).
  proposed_change jsonb not null,
  rationale     text,
  status        ai.proposal_status not null default 'proposed',
  created_by_agent text not null,          -- agent identifier
  reviewed_by   uuid references core.users(id),
  reviewed_at   timestamptz,
  applied_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists ai_proposals_tenant_idx on ai.proposals(tenant_id, status);

-- Prompt logs: every model interaction, tenant-scoped, for audit/debugging ---
create table if not exists ai.prompt_logs (
  id            bigint generated always as identity primary key,
  tenant_id     uuid not null references core.tenants(id) on delete cascade,
  proposal_id   uuid references ai.proposals(id) on delete set null,
  agent         text not null,
  model         text,
  -- Store prompts/responses with PII redacted at the app layer before insert.
  prompt        jsonb not null default '{}'::jsonb,
  response      jsonb not null default '{}'::jsonb,
  token_usage   jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists ai_prompt_logs_tenant_idx on ai.prompt_logs(tenant_id, created_at desc);

do $$ begin
  execute 'drop trigger if exists set_updated_at on ai.proposals';
  execute 'create trigger set_updated_at before update on ai.proposals '
       || 'for each row execute function core.set_updated_at()';
end $$;

-- RLS -----------------------------------------------------------------------
alter table ai.proposals   enable row level security;
alter table ai.prompt_logs enable row level security;

-- Reading proposals requires propose or approve permission.
drop policy if exists ai_proposals_read on ai.proposals;
create policy ai_proposals_read on ai.proposals
  for select using (
    core.has_permission(tenant_id, 'ai.propose', location_id)
    or core.has_permission(tenant_id, 'ai.approve', location_id)
  );

-- Creating a proposal requires propose; status transitions are done server-side
-- (service_role) after an approver with ai.approve confirms.
drop policy if exists ai_proposals_insert on ai.proposals;
create policy ai_proposals_insert on ai.proposals
  for insert with check (core.has_permission(tenant_id, 'ai.propose', location_id));

drop policy if exists ai_proposals_update on ai.proposals;
create policy ai_proposals_update on ai.proposals
  for update using (core.has_permission(tenant_id, 'ai.approve', location_id))
  with check (core.has_permission(tenant_id, 'ai.approve', location_id));

drop policy if exists ai_prompt_logs_read on ai.prompt_logs;
create policy ai_prompt_logs_read on ai.prompt_logs
  for select using (core.has_permission(tenant_id, 'core.audit.read'));
